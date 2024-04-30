// Import necessary libraries and modules
const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
import { FastifyReply, FastifyRequest } from "fastify";
import serverConfig from "./config";
import { environment } from "./config";
import { mintByMintingAPI } from "./minting";
import { verifyPassportToken, decodePassportToken, verifySNSSignature, getMetadataByTokenId, getPhaseForTokenID } from "./utils";
import {
  addTokenMinted,
  decreaseQuantityAllowed,
  getPhaseMaxTokenID,
  getPhaseTotalMintedQuantity,
  getTokenQuantityAllowed,
  getTokensMintedByWallet,
  getTotalMintedQuantity,
  hasAllowance,
  isAddressLocked,
  isOnAllowlist,
  lockAddress,
  queryAndCorrectPendingMints,
  setUUID,
  unlockAddress,
  updateUUIDStatus,
} from "./database";
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
  const mintPhases = serverConfig[environment].mintPhases;
  const currentPhaseIndex = mintPhases.findIndex((phase) => currentTime >= phase.startTime && currentTime <= phase.endTime);
  const currentPhase = mintPhases[currentPhaseIndex];
  if (!currentPhase) {
    logger.info("No active mint phase. Minting not allowed.");
    reply.status(403).send({ error: "No active mint phase." });
    return;
  }

  // Remove 'Bearer ' prefix and verify the ID token
  const idToken = authorizationHeader.replace("Bearer ", "");
  try {
    await verifyPassportToken(idToken);
    logger.debug("ID token verified successfully");
    const decodedToken = await decodePassportToken(idToken);
    const walletAddress = decodedToken.payload.passport.zkevm_eth_address;

    // Conduct transactional operations related to minting
    try {
      await prisma.$transaction(async (tx) => {
        // Check if the wallet address is locked
        const isLocked = await isAddressLocked(walletAddress, tx);
        if (isLocked) {
          logger.info(`Wallet address ${walletAddress} is locked.`);
          reply.status(403).send({ error: "Wallet address is locked." });
          return;
        }

        // Check the minted supply against the maximum limit for the current phase
        const phaseMintedSupply = await getPhaseTotalMintedQuantity(currentPhaseIndex, tx);
        if (phaseMintedSupply >= currentPhase.endTokenID - currentPhase.startTokenID + 1) {
          logger.info(`Maximum supply for the current phase (${currentPhase.name}) has been minted.`);
          reply.status(403).send({ error: `Maximum supply for the current phase (${currentPhase.name}) has been minted.` });
          return;
        }

        // Check the total minted supply against the maximum limit across all phases
        const totalSupplyMinted = await getTotalMintedQuantity(tx);
        if (totalSupplyMinted >= serverConfig[environment].maxTokenSupplyAcrossAllPhases) {
          logger.info(`Maximum supply across all phases has been minted.`);
          reply.status(403).send({ error: "Maximum supply across all phases has been minted." });
          return;
        }

        // Get the current token ID counter for the phase
        const maxTokenID = await getPhaseMaxTokenID(currentPhaseIndex, tx);
        if (maxTokenID === 0) {
          tokenIDcounter = currentPhase.startTokenID;
        } else {
          tokenIDcounter = maxTokenID + 1;
        }
        logger.debug(`Current token ID counter for the phase: ${tokenIDcounter}`);

        //Check if the allowlist is enabled
        if (currentPhase.enableAllowList) {
          // First check if the address is on the allowlist
          const isAllowlisted = await isOnAllowlist(walletAddress, currentPhaseIndex, tx);
          if (!isAllowlisted) {
            const errorReason = "Address is not on the allowlist.";
            logger.info(`Wallet address ${walletAddress} not allowed to mint in the current phase (${currentPhase.name}): ${errorReason}`);
            reply.status(403).send({ error: errorReason });
            return;
          }

          // Then check if the address has any allowance left
          const hasMintAllowance = await hasAllowance(walletAddress, currentPhaseIndex, tx);
          if (!hasMintAllowance) {
            const errorReason = "Address has no token allowance left.";
            logger.info(`Wallet address ${walletAddress} not allowed to mint in the current phase (${currentPhase.name}): ${errorReason}`);
            reply.status(403).send({ error: errorReason });
            return;
          }
        }

        // Check if the wallet has reached its minting limit per wallet for the phase
        if (currentPhase.maxTokensPerWallet) {
          const mintedByWallet = await getTokensMintedByWallet(walletAddress, tx);
          if (mintedByWallet >= currentPhase.maxTokensPerWallet) {
            logger.info(`Wallet address ${walletAddress} has reached the maximum mints per wallet (${currentPhase.maxTokensPerWallet}) for the current phase (${currentPhase.name}).`);
            reply.status(403).send({ error: `Maximum mints per wallet (${currentPhase.maxTokensPerWallet}) reached for the current phase (${currentPhase.name}).` });
            return;
          }
        }

        // Retrieve metadata for the token and initiate the minting process
        const metadata = await getMetadataByTokenId(serverConfig[environment].metadataDir, tokenIDcounter.toString());
        logger.info(`Initiating mint request for wallet address ${walletAddress}`);
        const uuid = await mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress, metadata, tokenIDcounter.toString());

        // Set UUID for the wallet address, lock the address, and record the minted token
        logger.debug(`Locking wallet address ${walletAddress}`);
        await lockAddress(walletAddress, tx);
        if (currentPhase.enableAllowList) {
          setUUID(walletAddress, uuid, tx);
        }
        await addTokenMinted(tokenIDcounter, serverConfig[environment].collectionAddress, walletAddress, currentPhaseIndex, uuid, "pending", tx);

        // Send response with wallet address and UUID of the mint
        const response = { tokenID: tokenIDcounter, collectionAddress: serverConfig[environment].collectionAddress, walletAddress, uuid };

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
fastify.get("/eligibility", async (request: FastifyRequest, reply: FastifyReply) => {
  // Ensure authorization header is present
  const authorizationHeader = request.headers["authorization"];
  if (!authorizationHeader) {
    logger.warn("Missing authorization header");
    reply.status(401).send({ error: "Missing authorization header" });
    return;
  }

  // Remove the 'Bearer ' prefix to extract the token
  const idToken = authorizationHeader.replace("Bearer ", "");

  try {
    // Verify the provided ID token
    await verifyPassportToken(idToken);
    logger.debug("ID token verified successfully");
    // Decode the token to obtain user-specific data
    const decodedToken = await decodePassportToken(idToken);
    const walletAddress = decodedToken.payload.passport.zkevm_eth_address;

    // Calculate the current time to check active mint phases
    const currentTime = Math.floor(Date.now() / 1000);
    const phaseEligibility = await Promise.all(
      serverConfig[environment].mintPhases.map(async (phase, index) => {
        const isActive = currentTime >= phase.startTime && currentTime <= phase.endTime;
        let walletTokenAllowance = null;
        let isAllowListed = false;
        let isEligible = false;

        if (phase.enableAllowList) {
          isAllowListed = await isOnAllowlist(walletAddress, index, prisma);

          if (isAllowListed) {
            walletTokenAllowance = await getTokenQuantityAllowed(walletAddress, prisma);
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
            const mintPhase = await getPhaseForTokenID(token_id);
            await prisma.$transaction(async (tx) => {
              await unlockAddress(owner_address, tx);
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

// Start the server
const start = async () => {
  try {
    await fastify.listen(3000);
    logger.info(`Server started successfully.`);

    // Check and correct pending mints
    await queryAndCorrectPendingMints();
    logger.info("Pending mints check completed.");
  } catch (err) {
    logger.error(`Error starting server:`, err);
    process.exit(1);
  }
};
start();
