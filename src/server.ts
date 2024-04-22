const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
import { FastifyReply, FastifyRequest } from "fastify";
import serverConfig from "./config";
import { environment } from "./config";
import { mintByMintingAPI, mintStatusSucceeded } from "./minting";
import { verifyToken, decodeToken, verifySignature } from "./utils";
import { isAllowlisted, lockAddress, markAddressAsMinted, unlockAddress } from "./database";
import { PrismaClient } from "@prisma/client";
import axios from "axios";

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
        const isAllowed = await isAllowlisted(walletAddress, tx);
        if (!isAllowed) {
          console.log("Wallet address not allowed to mint");
          reply.status(403).send({ error: "Wallet address not allowed to mint" });
          return;
        }

        // Initiate the mint request
        console.log("Initiating mint request");
        const uuid = await mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress);

        // Lock the row by updating the `isLocked` field
        await lockAddress(walletAddress, uuid, tx);

        // Prepare the response
        const response = {
          walletAddress,
          uuid,
        };

        // Send the response
        reply.send(response);
      });
    } catch (err) {
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

fastify.post("/webhook", async (request, reply) => {
  const { Type, SubscribeURL, TopicArn, Message, MessageId, Timestamp, Signature, SigningCertURL } = request.body;
  console.log("Received webhook:", request.body);

  if (Type === "SubscriptionConfirmation") {
    const allowedTopicArnPrefix = serverConfig[environment].allowedTopicArn.replace("*", "");

    if (TopicArn.startsWith(allowedTopicArnPrefix)) {
      try {
        const isValid = await verifySignature(request.body);

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
});

// Start the server
const start = async () => {
  try {
    await fastify.listen(3000);
    fastify.log.info(`Server running on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
