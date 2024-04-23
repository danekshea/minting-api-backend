const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
import { FastifyReply, FastifyRequest } from "fastify";
import serverConfig from "./config";
import { environment } from "./config";
import { mintByMintingAPI } from "./minting";
import { verifyToken, decodeToken, verifySNSSignature, getMetadataByTokenId } from "./utils";
import { addTokenMinted, decreaseQuantityAllowed, getMaxTokenID, getTotalMintedQuantity, isAllowlisted, lockAddress, setUUID, unlockAddress, updateUUIDStatus } from "./database";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import logger from "./logger";

const prisma = new PrismaClient();
let tokenIDcounter = 0;

fastify.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

fastify.post("/mint", async (request: FastifyRequest, reply: FastifyReply) => {
  const prisma = new PrismaClient();
  const authorizationHeader = request.headers["authorization"];

  if (!authorizationHeader) {
    logger.warn("Missing authorization header");
    reply.status(401).send({ error: "Missing authorization header" });
    return;
  }

  const mintedSupply = await getTotalMintedQuantity();
  if (mintedSupply >= serverConfig[environment].maxTokenSupply) {
    logger.info("Total supply minted. Minting not allowed.");
    reply.status(403).send({ error: "Total supply minted." });
    return;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime < serverConfig[environment].startTime || currentTime > serverConfig[environment].endTime) {
    logger.info("Current time is outside the minting window. Minting not allowed.");
    reply.status(403).send({ error: "Outside of mint window." });
    return;
  }

  const idToken = authorizationHeader.replace("Bearer ", "");

  try {
    await verifyToken(idToken);
    logger.debug("ID token verified successfully");
    const decodedToken = await decodeToken(idToken);
    const walletAddress = decodedToken.payload.passport.zkevm_eth_address;

    try {
      await prisma.$transaction(async (tx) => {
        const allowlistResult = await isAllowlisted(walletAddress, tx);
        if (!allowlistResult.isAllowed) {
          logger.info(`Wallet address ${walletAddress} not allowed to mint: ${allowlistResult.reason}`);
          reply.status(403).send({ error: `${allowlistResult.reason}` });
          return;
        }

        const metadata = await getMetadataByTokenId(serverConfig[environment].metadataDir, tokenIDcounter.toString());

        logger.info(`Initiating mint request for wallet address ${walletAddress}`);
        const uuid = await mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress, metadata, tokenIDcounter.toString());

        logger.debug(`Locking wallet address ${walletAddress} by UUID ${uuid}`);
        await setUUID(walletAddress, uuid, tx);
        await lockAddress(walletAddress, tx);
        await addTokenMinted(tokenIDcounter, serverConfig[environment].collectionAddress, walletAddress, uuid, "pending", tx);
        tokenIDcounter++;

        const response = {
          walletAddress,
          uuid,
        };

        reply.send(response);
      });
    } catch (err) {
      logger.error("Error during minting process:", err);
      reply.status(500).send({ error: "An error occurred during the minting process" });
    }
  } catch (err) {
    logger.warn("Failed to verify ID token:", err);
    reply.status(401).send({ error: "Invalid ID token" });
  } finally {
    await prisma.$disconnect();
  }
});

fastify.get("/check", async (request: FastifyRequest, reply: FastifyReply) => {
  const prisma = new PrismaClient();
  const authorizationHeader = request.headers["authorization"];

  if (!authorizationHeader) {
    logger.warn("Missing authorization header");
    reply.status(401).send({ error: "Missing authorization header" });
    return;
  }

  const idToken = authorizationHeader.replace("Bearer ", "");

  try {
    await verifyToken(idToken);
    logger.debug("ID token verified successfully");
    const decodedToken = await decodeToken(idToken);
    const walletAddress = decodedToken.payload.passport.zkevm_eth_address;

    try {
      await prisma.$transaction(async (tx) => {
        const allowlistResult = await isAllowlisted(walletAddress, tx);
        if (!allowlistResult.isAllowed) {
          logger.info(`Wallet address ${walletAddress} not allowed to mint: ${allowlistResult.reason}`);
          reply.status(403).send({ error: `${allowlistResult.reason}` });
          return;
        } else {
          logger.debug(`Wallet address ${walletAddress} is allowed to mint`);
          reply.send({ status: "ok" });
        }
      });
    } catch (err) {
      logger.error("Error during checking process:", err);
      reply.status(500).send({ error: "An error occurred during the checking process" });
    }
  } catch (err) {
    logger.warn("Failed to verify ID token:", err);
    reply.status(401).send({ error: "Invalid ID token" });
  } finally {
    await prisma.$disconnect();
  }
});

fastify.post("/webhook", async (request, reply) => {
  const { Type, SubscribeURL, TopicArn, Message, MessageId, Timestamp, Signature, SigningCertURL } = request.body;
  logger.debug("Received webhook:", request.body);

  if (Type === "SubscriptionConfirmation") {
    const allowedTopicArnPrefix = serverConfig[environment].allowedTopicArn.replace("*", "");

    if (TopicArn.startsWith(allowedTopicArnPrefix)) {
      try {
        const isValid = await verifySNSSignature(request.body);

        if (isValid) {
          const response = await axios.get(SubscribeURL);
          if (response.status === 200) {
            logger.info("Webhook subscription confirmed successfully");
          } else {
            logger.error("Failed to confirm webhook subscription");
          }
        } else {
          logger.warn("Invalid signature. Subscription confirmation denied.");
        }
      } catch (error) {
        logger.error("Error confirming webhook subscription:", error);
      }
    } else {
      logger.warn("Received subscription confirmation from an unknown TopicArn:", TopicArn);
    }

    reply.send({ status: "ok" });
  }

  if (Type === "Notification") {
    try {
      const isValid = await verifySNSSignature(request.body);
      if (isValid) {
        const message = JSON.parse(Message);
        const { event_name } = message;
        const { reference_id, status, owner_address } = message.data;

        if (event_name === "imtbl_zkevm_mint_request_updated") {
          logger.info("Received mint request update notification:", message);

          if (status === "succeeded") {
            logger.info(`Mint request ${reference_id} succeeded for owner address ${owner_address}`);
            await prisma.$transaction(async (tx) => {
              await unlockAddress(owner_address, tx);
              await decreaseQuantityAllowed(owner_address, tx);
              await updateUUIDStatus(reference_id, "succeeded", tx);
            });
          } else if (status === "pending") {
            logger.debug(`Mint request ${reference_id} is pending`);
          } else if (status === "failed") {
            logger.warn(`Mint request ${reference_id} failed for owner address ${owner_address}`);
            await prisma.$transaction(async (tx) => {
              await unlockAddress(owner_address, tx);
              await updateUUIDStatus(reference_id, "failed", tx);
            });
          }
        } else {
          logger.warn("Received notification for an unknown event:", event_name);
        }
      } else {
        logger.warn("Invalid signature. Notification denied.");
      }
    } catch (error) {
      logger.error("Error processing notification:", error);
    }
    reply.send({ status: "ok" });
  }
});

// Start the server
const start = async () => {
  try {
    await fastify.listen(3000);
    tokenIDcounter = (await getMaxTokenID()) + 1;
    logger.info(`Server started successfully. Token ID counter initialized at ${tokenIDcounter}.`);
  } catch (err) {
    logger.error("Error starting server:", err);
    process.exit(1);
  }
};
start();
