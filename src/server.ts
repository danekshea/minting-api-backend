// Import necessary libraries and modules
const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
import { FastifyReply, FastifyRequest } from "fastify";
import serverConfig from "./config";
import { environment } from "./config";
import { mintByMintingAPI } from "./minting";
import { verifyToken, decodeToken, verifySNSSignature, getMetadataByTokenId } from "./utils";
import { addTokenMinted, decreaseQuantityAllowed, getMaxTokenID, getTokensMintedByWallet, getTotalMintedQuantity, isAllowlisted, lockAddress, queryAndCorrectPendingMints, setUUID, unlockAddress, updateUUIDStatus } from "./database";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import logger from "./logger";

// Initialize Prisma Client for database interactions
const prisma = new PrismaClient();
let tokenIDcounter = 0;

// Enable CORS with specified options for API security and flexibility
fastify.register(cors, {
  origin: "*", // Allow all origins
  methods: ["GET", "POST", "PUT", "DELETE"], // Supported HTTP methods
  allowedHeaders: ["Content-Type", "Authorization"], // Allowed HTTP headers
});

// Define POST endpoint for minting tokens
fastify.post("/mint", async (request: FastifyRequest, reply: FastifyReply) => {
  const authorizationHeader = request.headers["authorization"];

  // Check if the authorization header is present
  if (!authorizationHeader) {
    logger.warn("Missing authorization header");
    reply.status(401).send({ error: "Missing authorization header" });
    return;
  }

  // Validate that the current time is within an active mint phase
  const currentTime = Math.floor(Date.now() / 1000);
  const currentPhase = serverConfig[environment].mintPhases.find((phase) => currentTime >= phase.startTime && currentTime <= phase.endTime);
  if (!currentPhase) {
    logger.info("No active mint phase. Minting not allowed.");
    reply.status(403).send({ error: "No active mint phase." });
    return;
  }

  // Check if the current minted supply has reached the maximum limit for the current phase
  const mintedSupply = await getTotalMintedQuantity();
  if (mintedSupply >= currentPhase.maxSupply) {
    logger.info(`Maximum supply for the current phase (${currentPhase.name}) has been minted.`);
    reply.status(403).send({ error: `Maximum supply for the current phase (${currentPhase.name}) has been minted.` });
    return;
  }

  // Remove 'Bearer ' prefix and verify the ID token
  const idToken = authorizationHeader.replace("Bearer ", "");
  try {
    await verifyToken(idToken);
    logger.debug("ID token verified successfully");
    const decodedToken = await decodeToken(idToken);
    const walletAddress = decodedToken.payload.passport.zkevm_eth_address;

    // Conduct transactional operations related to minting
    try {
      await prisma.$transaction(async (tx) => {
        // Check if the wallet is allowlisted if required
        if (currentPhase.enableAllowList) {
          const allowlistResult = await isAllowlisted(walletAddress, tx);
          if (!allowlistResult.isAllowed) {
            logger.info(`Wallet address ${walletAddress} not allowed to mint in the current phase (${currentPhase.name}): ${allowlistResult.reason}`);
            reply.status(403).send({ error: `${allowlistResult.reason}` });
            return;
          }
        }

        // Check if the wallet has reached its minting limit per wallet for the phase
        if (currentPhase.maxPerWallet) {
          const mintedByWallet = await getTokensMintedByWallet(walletAddress);
          if (mintedByWallet >= currentPhase.maxPerWallet) {
            logger.info(`Wallet address ${walletAddress} has reached the maximum mints per wallet (${currentPhase.maxPerWallet}) for the current phase (${currentPhase.name}).`);
            reply.status(403).send({ error: `Maximum mints per wallet (${currentPhase.maxPerWallet}) reached for the current phase (${currentPhase.name}).` });
            return;
          }
        }

        // Retrieve metadata for the token and initiate the minting process
        const metadata = await getMetadataByTokenId(serverConfig[environment].metadataDir, tokenIDcounter.toString());
        logger.info(`Initiating mint request for wallet address ${walletAddress}`);
        const uuid = await mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress, metadata, tokenIDcounter.toString());

        // Set UUID for the wallet address, lock the address, and record the minted token
        logger.debug(`Locking wallet address ${walletAddress} by UUID ${uuid}`);
        await setUUID(walletAddress, uuid, tx);
        await lockAddress(walletAddress, tx);
        await addTokenMinted(tokenIDcounter, serverConfig[environment].collectionAddress, walletAddress, uuid, "pending", tx);
        tokenIDcounter++;

        // Send response with wallet address and UUID of the mint
        const response = { walletAddress, uuid };
        reply.send(response);
      });
    } catch (err) {
      // Handle errors that occur during the minting process
      logger.error(`Error during minting process: ${JSON.stringify(err, null, 2)}`);
      reply.status(500).send({ error: "An error occurred during the minting process" });
    }
  } catch (err) {
    // Handle errors related to ID token verification
    logger.warn(`Failed to verify ID token: ${JSON.stringify(err, null, 2)}`);
    reply.status(401).send({ error: "Invalid ID token" });
  } finally {
    // Ensure database connection is closed
    await prisma.$disconnect();
  }
});

// Additional endpoints for configuration and eligibility not commented for brevity
// Consider adding similar detailed comments to those endpoints

fastify.get("/config", async (request: FastifyRequest, reply: FastifyReply) => {
  const mintPhases = serverConfig[environment].mintPhases.map((phase) => ({
    name: phase.name,
    startTime: phase.startTime,
    endTime: phase.endTime,
    maxSupply: phase.maxSupply,
    enableAllowList: phase.enableAllowList,
  }));

  reply.send({ mintPhases });
});

fastify.get("/eligibility", async (request: FastifyRequest, reply: FastifyReply) => {
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

    const currentTime = Math.floor(Date.now() / 1000);
    const mintPhases = serverConfig[environment].mintPhases;

    const phaseEligibility = await Promise.all(
      mintPhases.map(async (phase) => {
        const isActive = currentTime >= phase.startTime && currentTime <= phase.endTime;

        let isEligible = !phase.enableAllowList;
        if (phase.enableAllowList) {
          const allowListResult = await isAllowlisted(walletAddress, prisma);
          isEligible = allowListResult.isAllowed;
        }

        return {
          name: phase.name,
          isActive,
          isEligible,
        };
      })
    );

    reply.send({ phases: phaseEligibility });
  } catch (err) {
    logger.warn("Failed to verify ID token:", err);
    reply.status(401).send({ error: "Invalid ID token" });
  } finally {
    await prisma.$disconnect();
  }
});

fastify.post("/webhook", async (request, reply) => {
  const { Type, SubscribeURL, TopicArn, Message, MessageId, Timestamp, Signature, SigningCertURL } = request.body;
  logger.debug(`Received webhook: ${JSON.stringify(request.body, null, 2)}`);

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
        logger.error(`Error confirming webhook subscription: ${JSON.stringify(error, null, 2)}`);
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
      logger.error(`Error processing notification: ${JSON.stringify(error, null, 2)}`);
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

    // Check and correct pending mints
    await queryAndCorrectPendingMints();
    logger.info("Pending mints check completed.");
  } catch (err) {
    logger.error(`Error starting server: ${JSON.stringify(err, null, 2)}`);
    process.exit(1);
  }
};
start();
