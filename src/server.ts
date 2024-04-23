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

const prisma = new PrismaClient();
let tokenIDcounter = 0;

// //Disables CORS altogether
// fastify.register(cors, {
//   origin: true,
// });

//Change this once the actual API goes live
fastify.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

fastify.post("/mint", async (request: FastifyRequest, reply: FastifyReply) => {
  const prisma = new PrismaClient();
  const authorizationHeader = request.headers["authorization"];

  if (!authorizationHeader) {
    reply.status(401).send({ error: "Missing authorization header" });
    return;
  }

  // Check the total minted supply before initiating the minting process
  const mintedSupply = await getTotalMintedQuantity();
  if (mintedSupply >= serverConfig[environment].maxTokenSupply) {
    reply.status(403).send({ error: "Total supply minted." });
    return;
  }

  const idToken = authorizationHeader.replace("Bearer ", "");

  try {
    // Verify and decode the IDToken, should throw an error if the signature is invalid
    await verifyToken(idToken);
    console.log("ID token verified");
    const decodedToken = await decodeToken(idToken);
    const walletAddress = decodedToken.payload.passport.zkevm_eth_address;

    try {
      // Start a database transaction
      await prisma.$transaction(async (tx) => {
        // Check if the wallet address is allowed to mint
        const allowlistResult = await isAllowlisted(walletAddress, tx);
        if (!allowlistResult.isAllowed) {
          console.log(allowlistResult.reason);
          reply.status(403).send({ error: `${allowlistResult.reason}` });
          return;
        }

        const metadata = await getMetadataByTokenId(serverConfig[environment].metadataDir, tokenIDcounter.toString());

        // Initiate the mint request
        console.log("Initiating mint request");
        const uuid = await mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress, metadata, tokenIDcounter.toString());

        // Lock the row by updating the `isLocked` field using UUID
        console.log("Locking wallet address by UUID");
        await setUUID(walletAddress, uuid, tx);
        await lockAddress(walletAddress, tx);
        await addTokenMinted(tokenIDcounter, serverConfig[environment].collectionAddress, walletAddress, uuid, "pending", tx);
        tokenIDcounter++;

        // Prepare the response
        const response = {
          walletAddress,
          uuid,
        };

        // Send the response
        reply.send(response);
      });
    } catch (err) {
      console.log(err);
      fastify.log.error("Error during minting process:", err);
      reply.status(500).send({ error: "An error occurred during the minting process" });
    }
  } catch (err) {
    fastify.log.error("Failed to verify ID token:", err);
    reply.status(401).send({ error: "Invalid ID token" });
  } finally {
    await prisma.$disconnect();
  }
});

fastify.get("/check", async (request: FastifyRequest, reply: FastifyReply) => {
  const prisma = new PrismaClient();
  const authorizationHeader = request.headers["authorization"];

  if (!authorizationHeader) {
    reply.status(401).send({ error: "Missing authorization header" });
    return;
  }

  const idToken = authorizationHeader.replace("Bearer ", "");

  try {
    // Verify and decode the IDToken, should throw an error if the signature is invalid
    await verifyToken(idToken);
    console.log("ID token verified");
    const decodedToken = await decodeToken(idToken);
    const walletAddress = decodedToken.payload.passport.zkevm_eth_address;

    try {
      // Start a database transaction
      await prisma.$transaction(async (tx) => {
        // Check if the wallet address is allowed to mint
        const allowlistResult = await isAllowlisted(walletAddress, tx);
        if (!allowlistResult.isAllowed) {
          console.log(allowlistResult.reason);
          reply.status(403).send({ error: `${allowlistResult.reason}` });
          return;
        } else {
          reply.send({ status: "ok" });
        }
      });
    } catch (err) {
      fastify.log.error("Error during checking process:", err);
      reply.status(500).send({ error: "An error occurred during the checking process" });
    }
  } catch (err) {
    fastify.log.error("Failed to verify ID token:", err);
    reply.status(401).send({ error: "Invalid ID token" });
  } finally {
    await prisma.$disconnect();
  }
});

fastify.post("/webhook", async (request, reply) => {
  const { Type, SubscribeURL, TopicArn, Message, MessageId, Timestamp, Signature, SigningCertURL } = request.body;
  console.log("Received webhook:", request.body);

  if (Type === "SubscriptionConfirmation") {
    const allowedTopicArnPrefix = serverConfig[environment].allowedTopicArn.replace("*", "");

    if (TopicArn.startsWith(allowedTopicArnPrefix)) {
      try {
        const isValid = await verifySNSSignature(request.body);

        if (isValid) {
          const response = await axios.get(SubscribeURL);
          if (response.status === 200) {
            console.log("Webhook subscription confirmed");
          } else {
            console.error("Failed to confirm webhook subscription");
          }
        } else {
          console.error("Invalid signature. Subscription confirmation denied.");
        }
      } catch (error) {
        console.error("Error confirming webhook subscription:", error);
      }
    } else {
      console.warn("Received subscription confirmation from an unknown TopicArn:", TopicArn);
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
          //log all the above values
          console.log("Received notification:", message);
          console.log("Reference ID:", reference_id);
          console.log("Status:", status);
          console.log("Owner address:", owner_address);

          if (status === "succeeded") {
            console.log("Mint request succeeded:", reference_id);
            await prisma.$transaction(async (tx) => {
              await unlockAddress(owner_address, tx);
              await decreaseQuantityAllowed(owner_address, tx);
              await updateUUIDStatus(reference_id, "succeeded", tx);
            });
          } else if (status === "pending") {
            console.log("Mint request pending:", reference_id);
          } else if (status === "failed") {
            console.log("Mint request failed:", reference_id);
            await prisma.$transaction(async (tx) => {
              await unlockAddress(owner_address, tx);
              await updateUUIDStatus(reference_id, "failed", tx);
            });
          }
        } else {
          console.log("Received notification for an unknown event:", event_name);
        }
      } else {
        console.error("Invalid signature. Notification denied.");
      }
    } catch (error) {
      console.error("Error processing notification:", error);
    }
    reply.send({ status: "ok" });
  }
});

// Start the server
const start = async () => {
  try {
    await fastify.listen(3000);
    tokenIDcounter = (await getMaxTokenID()) + 1;
    console.log(`Token ID counter initialized at ${tokenIDcounter}`);
    fastify.log.info(`Server running on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
