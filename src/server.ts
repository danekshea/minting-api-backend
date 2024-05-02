// Import necessary libraries and modules
const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
import { FastifyReply, FastifyRequest } from "fastify";
import serverConfig from "./config";
import { environment } from "./config";
import { performMint } from "./minting";
import {
  verifyPassportToken,
  decodePassportToken,
  verifySNSSignature,
  checkConfigValidity,
  checkCurrentMintPhaseIsActive,
} from "./utils";
import {
  decreaseQuantityAllowed,
  getPhaseForTokenID,
  getTokenQuantityAllowed,
  isOnAllowlist,
  queryAndCorrectPendingMints,
  unlockAddress,
  updateUUIDStatus,
} from "./database";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import logger from "./logger";
import { eoaMintRequest } from "./types";
import { recoverMessageAddress, verifyMessage } from "viem";
import { ethers } from "ethers";

// Initialize Prisma Client for database interactions
const prisma = new PrismaClient();

// Enable CORS with specified options for API security and flexibility
fastify.register(cors, {
  origin: "*", // Allow all origins
  methods: ["GET", "POST", "PUT", "DELETE"], // Supported HTTP methods
  allowedHeaders: ["Content-Type", "Authorization"], // Allowed HTTP headers
});

// Define POST endpoint for minting tokens
fastify.post("/mint/passport", async (request: FastifyRequest, reply: FastifyReply) => {
  const authorizationHeader = request.headers["authorization"];

  // Check if the authorization header is present
  if (!authorizationHeader) {
    logger.warn("Missing authorization header");
    reply.status(401).send({ error: "Missing authorization header" });
    return;
  }

  const { currentPhase, currentPhaseIndex } = await checkCurrentMintPhaseIsActive();
  if (!currentPhase) {
    logger.info("No active mint phase. Minting not allowed.");
    reply.status(403).send({ error: "No active mint phase." });
    return null;
  }

  // Remove 'Bearer ' prefix and verify the ID token
  const idToken = authorizationHeader.replace("Bearer ", "");
  try {
    await verifyPassportToken(idToken);
    logger.debug("ID token verified successfully");
    const decodedToken = await decodePassportToken(idToken);
    const walletAddress = decodedToken.payload.passport.zkevm_eth_address.toLowerCase();

    // Conduct transactional operations related to minting
    try {
      const result = await prisma.$transaction(async (tx) => {
        return await performMint(walletAddress, currentPhase, currentPhaseIndex, tx);
      });
      reply.send(result);
    } catch (err) {
      // Handle errors that occur during the minting process
      logger.error(`Error during minting process: ${err}`);
      reply.status(500).send({ error: `${err}` });
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

// Define POST endpoint for minting tokens
fastify.post("/mint/eoa", async (request: eoaMintRequest, reply: FastifyReply) => {
  const { signature } = request.body;
  const message = serverConfig[environment].eoaMintMessage;

  // Check if a mint phase is currently active
  const { currentPhase, currentPhaseIndex } = await checkCurrentMintPhaseIsActive();
  if (!currentPhase) {
    logger.info("No active mint phase. Minting not allowed.");
    reply.status(403).send({ error: "No active mint phase." });
    return;
  }

  // Attempt to recover wallet address from the signature
  let walletAddress: `0x${string}`;
  try {
    walletAddress = await recoverMessageAddress({ message, signature });
  } catch (error) {
    logger.warn(`Failed to recover wallet address: ${error}`);
    reply.status(401).send({ error: "Failed to verify signature." });
    return;
  }

  // Verify the recovered address with the message and signature
  try {
    await verifyMessage({ address: walletAddress, message, signature });
  } catch (error) {
    logger.warn(`Signature verification failed: ${error}`);
    reply.status(401).send({ error: "Invalid signature." });
    return;
  }

  // Perform the minting process within a transaction
  try {
    const result = await prisma.$transaction(async (tx) => {
      return performMint(walletAddress.toLowerCase(), currentPhase, currentPhaseIndex, tx);
    });
    reply.send(result);
  } catch (error) {
    logger.error(`Error during minting process: ${error}`);
    reply.status(500).send({ error: `${error}` });
  } finally {
    // Disconnect from the database once processing is complete
    await prisma.$disconnect();
  }
});

// GET endpoint for retrieving minting phase configurations
fastify.get("/config", async (request: FastifyRequest, reply: FastifyReply) => {
  // Map through the mint phases to restructure the data for client consumption
  const mintPhases = serverConfig[environment].mintPhases.map((phase) => {
    const phaseConfig: any = {
      name: phase.name,
      startTime: phase.startTime,
      endTime: phase.endTime,
      startTokenID: phase.startTokenID,
      endTokenID: phase.endTokenID,
      enableAllowList: phase.enableAllowList,
    };

    // Add maxPerWallet property only if it exists in the configuration
    if (phase.maxTokensPerWallet) {
      phaseConfig.maxPerWallet = phase.maxTokensPerWallet;
    }

    return phaseConfig;
  });

  // Send the structured mint phases data as a response
  reply.send({
    chainName: serverConfig[environment].chainName,
    collectionAddress: serverConfig[environment].collectionAddress,
    maxTokenSupplyAcrossAllPhases: serverConfig[environment].maxTokenSupplyAcrossAllPhases,
    mintPhases,
  });
});

// GET endpoint to check a user's eligibility to participate in minting
fastify.get("/eligibility/:address", async (request: FastifyRequest<{ Params: { address: string } }>, reply: FastifyReply) => {
  const address = request.params.address.toLowerCase();
  if (!ethers.isAddress(address)) {
    reply.status(400).send({ error: "Invalid address check" })
  }

  try {
    // Calculate the current time to check active mint phases
    const currentTime = Math.floor(Date.now() / 1000);
    const phaseEligibility = await Promise.all(
      serverConfig[environment].mintPhases.map(async (phase, index) => {
        const isActive = currentTime >= phase.startTime && currentTime <= phase.endTime;
        let walletTokenAllowance = null;
        let isAllowListed = false;
        let isEligible = false;

        if (phase.enableAllowList) {
          isAllowListed = await isOnAllowlist(address, index, prisma);

          if (isAllowListed) {
            walletTokenAllowance = await getTokenQuantityAllowed(address, prisma);
          }
        }

        isEligible = !phase.enableAllowList || isAllowListed;

        return {
          name: phase.name,
          startTime: phase.startTime,
          endTime: phase.endTime,
          startTokenID: phase.startTokenID,
          endTokenID: phase.endTokenID,
          isActive,
          isEligible,
          ...(isAllowListed && { walletTokenAllowance }),
          ...(!phase.enableAllowList && { maxTokensPerWallet: phase.maxTokensPerWallet }),
        };
      })
    );
    // Send eligibility information as a response
    reply.send({
      chainName: serverConfig[environment].chainName,
      collectionAddress: serverConfig[environment].collectionAddress,
      maxTokenSupplyAcrossAllPhases: serverConfig[environment].maxTokenSupplyAcrossAllPhases,
      mintPhases: phaseEligibility,
    });
  } catch (err) {
    logger.warn("Failed to verify ID token:", err);
    reply.status(401).send({ error: "Invalid ID token" });
  } finally {
    // Always disconnect from the database when done
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
        const { reference_id, token_id, status, owner_address } = message.data;
        if (event_name === "imtbl_zkevm_mint_request_updated") {
          logger.info("Received mint request update notification:");
          console.log(message);
          if (status === "succeeded") {
            logger.info(`Mint request ${reference_id} succeeded for owner address ${owner_address}`);
            await prisma.$transaction(async (tx) => {
              await unlockAddress(owner_address, tx);
              const mintPhase = await getPhaseForTokenID(parseInt(token_id), tx);
              if (mintPhase !== null && serverConfig[environment].mintPhases[mintPhase].enableAllowList) {
                await decreaseQuantityAllowed(owner_address, tx);
              }
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
          logger.warn("Received notification for an unknown event:");
          console.log(event_name);
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

fastify.get("/get-mint-request/:referenceId", async (request: FastifyRequest<{ Params: { referenceId: string } }>, reply: FastifyReply) => {
  const { referenceId } = request.params;

  try {
    const response = await axios.get(`https://api.sandbox.immutable.com/v1/chains/${serverConfig[environment].chainName}/collections/${serverConfig[environment].collectionAddress}/nfts/mint-requests/${referenceId}`, {
      headers: {
        "x-immutable-api-key": serverConfig[environment].API_KEY,
      },
    });

    reply.send(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error("Error querying mint request:", error.message);
      reply.status(error.response?.status || 500).send({ error: "Failed to query mint request" });
    } else {
      logger.error("Unexpected error querying mint request:", error);
      reply.status(500).send({ error: "An unexpected error occurred" });
    }
  }
});

fastify.get("/get-eoa-mint-message", async (request: FastifyRequest, reply: FastifyReply) => {
  reply.send({ serverConfig: serverConfig[environment].eoaMintMessage });
});

// Start the server
const start = async () => {
  try {
    if (!checkConfigValidity(serverConfig[environment])) {
      throw new Error("Invalid server configuration. Exiting.");
    }

    await fastify.listen(3000);
    logger.info(`Server started successfully on port 3000.`);

    // Check and correct pending mints
    await queryAndCorrectPendingMints();
    logger.info("Pending mints check completed.");
  } catch (err) {
    logger.error(`Error starting server: ${err.message}`);
    // Optionally, you might want to handle specific errors differently here
    process.exit(1);
  }
};

start();
