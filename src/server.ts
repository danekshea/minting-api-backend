// Import necessary libraries and modules
const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
import { FastifyReply, FastifyRequest } from "fastify";
import serverConfig, { IMX_JWT_KEY_URL, environment } from "./config";
import { mintByMintingAPI } from "./minting";
import { verifyPassportToken, decodePassportToken, verifySNSSignature, returnActivePhase } from "./utils";
import { addTokenMinted, checkAddressMinted, readAddressesFromAllowlist, totalMintCountAcrossAllPhases, updateUUIDStatus } from "./database";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import logger from "./logger";
import { ExtendedMintPhase, eoaMintRequest } from "./types";
import { recoverMessageAddress, verifyMessage, isAddress } from "viem";
import { ethers } from "ethers";
import { v4 as uuidv4 } from "uuid";
import { Prisma } from "@prisma/client";
import { error } from "console";

// Initialize Prisma Client for database interactions
const prisma = new PrismaClient();
let allowlists: string[][] = [];
let jwk: string;
let totalMintCount: number;

// Define the metadata for the NFT
const metadata = serverConfig[environment].metadata;

// Enable CORS with specified options for API security and flexibility
fastify.register(cors, {
  origin: "*", // Allow all origins
  methods: ["GET", "POST", "PUT", "DELETE"], // Supported HTTP methods
  allowedHeaders: ["Content-Type", "Authorization"], // Allowed HTTP headers
});

fastify.get("/config", async (request: FastifyRequest, reply: FastifyReply) => {
  const environmentConfig = serverConfig[environment];

  try {
    const mintPhases = serverConfig[environment].mintPhases;
    const totalMintedAcrossAllPhases = await totalMintCountAcrossAllPhases(prisma);

    // Use Promise.all to wait for all async operations to complete
    const processedPhases = await Promise.all(
      mintPhases.map(async (phase, index) => {
        const phaseConfig: ExtendedMintPhase = {
          name: phase.name,
          startTime: phase.startTime,
          endTime: phase.endTime,
          allowList: phase.allowList,
        };

        return phaseConfig;
      })
    );

    reply.send({
      chainName: environmentConfig.chainName,
      collectionAddress: environmentConfig.collectionAddress,
      maxTokenSupplyAcrossAllPhases: environmentConfig.maxTokenSupplyAcrossAllPhases,
      totalMintedAcrossAllPhases: totalMintedAcrossAllPhases,
      eoaMintMessage: serverConfig[environment].eoaMintMessage,
      mintPhases: processedPhases, // Send the processed list
    });
  } catch (error) {
    console.error("Failed to retrieve configuration data:", error);
    reply.status(500).send({ error: "Failed to retrieve configuration data." });
  }
});

// GET endpoint to check a user's eligibility to participate in minting
fastify.get("/eligibility/:address", async (request: FastifyRequest<{ Params: { address: string } }>, reply: FastifyReply) => {
  const address = request.params.address.toLowerCase();

  if (!isAddress(address)) {
    reply.status(400).send({ error: "Invalid address check" });
    return;
  }

  try {
    // Calculate the current time to check active mint phases
    const currentTime = Math.floor(Date.now() / 1000);
    const phaseEligibility = await Promise.all(
      serverConfig[environment].mintPhases.map(async (phase, index) => {
        const isActive = currentTime >= phase.startTime && currentTime <= phase.endTime;
        const isAllowListed = !phase.allowList || allowlists[index].includes(address);

        return {
          name: phase.name,
          startTime: phase.startTime,
          endTime: phase.endTime,
          isActive,
          isAllowListed,
        };
      })
    );
    // Send eligibility information as a response
    reply.send({
      chainName: serverConfig[environment].chainName,
      collectionAddress: serverConfig[environment].collectionAddress,
      maxTokenSupplyAcrossAllPhases: serverConfig[environment].maxTokenSupplyAcrossAllPhases,
      hasMinted: await checkAddressMinted(address, prisma),
      mintPhases: phaseEligibility,
    });
  } catch (err) {
    logger.warn("Failed to verify ID token:", err);
    reply.status(401).send({ error: "Invalid ID token" });
  }
});

// Define POST endpoint for minting tokens
fastify.post("/mint/passport", async (request: FastifyRequest, reply: FastifyReply) => {
  const authorizationHeader = request.headers["authorization"];
  let walletAddress: string;
  let activePhase: number | null;

  // Check if the authorization header is present
  if (!authorizationHeader) {
    logger.warn("Missing authorization header");
    reply.status(401).send({ error: "Missing authorization header" });
    return;
  }

  // Check if a phase is active and return it
  try {
    activePhase = returnActivePhase();
    if (activePhase === null) {
      logger.warn("No active mint phase found.");
      reply.status(401).send({ error: "No active mint phase found." });
      return;
    } else {
      logger.info(`Active mint phase found: ${activePhase}`);
    }
  } catch {
    logger.error("Error checking active mint phase.");
    reply.status(500).send({ error: "Failed to check active mint phase." });
    return;
  }

  if (totalMintCount >= serverConfig[environment].maxTokenSupplyAcrossAllPhases) {
    logger.warn("Total mint count has reached the limit.");
    reply.status(401).send({ error: "Total mint count has reached the limit." });
    return;
  }

  // Remove 'Bearer ' prefix and verify the ID token
  const idToken = authorizationHeader.replace("Bearer ", "");
  try {
    await verifyPassportToken(idToken, jwk);
    logger.debug("ID token verified successfully");
    const decodedToken = await decodePassportToken(idToken);
    walletAddress = decodedToken.payload.passport.zkevm_eth_address.toLowerCase();
  } catch (error) {
    logger.error(`Error verifying ID token: ${error}`);
    reply.status(401).send({ error: "Invalid ID token" });
    return;
  }

  // If allowlist is enabled for a given phase, check if the wallet address is on the allowlist for the given phase
  if (serverConfig[environment].mintPhases[activePhase].allowList) {
    try {
      if (allowlists[activePhase].includes(walletAddress)) {
        logger.info(`Wallet address ${walletAddress} is on the allowlist for phase ${activePhase}.`);
      } else {
        logger.warn(`Wallet address ${walletAddress} is not on the allowlist for phase ${activePhase}.`);
        reply.status(401).send({ error: "Wallet address is not on the allowlist." });
        return;
      }
    } catch (error) {
      logger.error(`Error checking allowlist: ${error}`);
      reply.status(500).send({ error: "Failed to check allowlist." });
      return;
    }
  }

  // Perform the minting process within a transaction
  // Conduct transactional operations related to minting
  const uuid = uuidv4();
  logger.info(`Attempting to mint NFT wallet address ${walletAddress} with UUID ${uuid}`);
  try {
    // Record the minting operation in the database
    await addTokenMinted(walletAddress, uuid, activePhase, "pending", prisma);

    totalMintCount++;
    logger.info(`Total mint count: ${totalMintCount}`);

    // If all operations are successful, construct the response object
    const result = { collectionAddress: serverConfig[environment].collectionAddress, walletAddress, uuid };

    // Send the successful result back to the client
    reply.send(result);

    mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress, uuid, metadata)
      .then(() => {
        logger.info("Minting API call successful.");
      })
      .catch((apiError) => {
        logger.error(`Minting API call failed: ${error}`);
      });
  } catch (error) {
    // Determine the error type and respond accordingly
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Handle unique constraint violation
      logger.error(`Unique constraint failed for address: ${error}`);
      reply.status(401).send({ error: "Unauthorized: Duplicate entry for address" });
    } else {
      // Log the error that caused the transaction to fail
      logger.error(`Error during minting process: ${error}`);

      // Send a general error response to the client
      reply.status(500).send({ error: `Failed to process mint request: ${error}` });
    }
  }
});

// Define POST endpoint for minting tokens
fastify.post("/mint/eoa", async (request: eoaMintRequest, reply: FastifyReply) => {
  const message = serverConfig[environment].eoaMintMessage;
  const { signature } = request.body || {};

  // Guard against signature being undefined
  if (!signature) {
    return reply.status(400).send({ error: "Signature is required" });
  }

  // Attempt to recover wallet address from the signature
  let recoveredWalletAddress: `0x${string}`;
  let walletAddress: string;
  let activePhase: number | null;

  // Check if a phase is active and return it
  try {
    activePhase = returnActivePhase();
    if (activePhase === null) {
      logger.warn("No active mint phase found.");
      reply.status(401).send({ error: "No active mint phase found." });
      return;
    } else {
      logger.info(`Active mint phase found: ${activePhase}`);
    }
  } catch {
    logger.error("Error checking active mint phase.");
    reply.status(500).send({ error: "Failed to check active mint phase." });
    return;
  }

  if (totalMintCount >= serverConfig[environment].maxTokenSupplyAcrossAllPhases) {
    logger.warn("Total mint count has reached the limit.");
    reply.status(401).send({ error: "Total mint count has reached the limit." });
    return;
  }

  //Recover the wallet address
  try {
    console.log(`Signature: ${signature}`);
    recoveredWalletAddress = await recoverMessageAddress({ message, signature });
    logger.info(`Recovered wallet address: ${recoveredWalletAddress} from signature: ${signature}`);
    walletAddress = recoveredWalletAddress.toLowerCase();
  } catch (error) {
    logger.warn(`Failed to recover wallet address: ${error}`);
    reply.status(401).send({ error: "Failed to verify signature." });
    return;
  }

  // Verify the recovered address with the message and signature
  try {
    await verifyMessage({ address: recoveredWalletAddress, message, signature });
  } catch (error) {
    logger.warn(`Signature verification failed: ${error}`);
    reply.status(401).send({ error: "Invalid signature." });
    return;
  }

  // If allowlist is enabled for a given phase, check if the wallet address is on the allowlist for the given phase
  if (serverConfig[environment].mintPhases[activePhase].allowList) {
    try {
      if (allowlists[activePhase].includes(walletAddress)) {
        logger.info(`Wallet address ${walletAddress} is on the allowlist for phase ${activePhase}.`);
      } else {
        logger.warn(`Wallet address ${walletAddress} is not on the allowlist for phase ${activePhase}.`);
        reply.status(401).send({ error: "Wallet address is not on the allowlist." });
        return;
      }
    } catch (error) {
      logger.error(`Error checking allowlist: ${error}`);
      reply.status(500).send({ error: "Failed to check allowlist." });
      return;
    }
  }

  // Perform the minting process within a transaction
  // Conduct transactional operations related to minting
  const uuid = uuidv4();
  logger.info(`Attempting to mint NFT wallet address ${walletAddress} with UUID ${uuid}`);
  try {
    // Record the minting operation in the database
    await addTokenMinted(walletAddress, uuid, activePhase, "pending", prisma);

    totalMintCount++;
    logger.info(`Total mint count: ${totalMintCount}`);

    // If all operations are successful, construct the response object
    const result = { collectionAddress: serverConfig[environment].collectionAddress, walletAddress, uuid };

    // Send the successful result back to the client
    reply.send(result);

    mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress, uuid, metadata)
      .then(() => {
        logger.info("Minting API call successful.");
      })
      .catch((apiError) => {
        logger.error(`Minting API call failed for ${walletAddress} and ${uuid}: ${apiError}`);
      });
  } catch (error) {
    // Determine the error type and respond accordingly
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Handle unique constraint violation
      logger.error(`Unique constraint failed for address: ${error}`);
      reply.status(401).send({ error: "Unauthorized: Duplicate entry for address" });
    } else {
      // Log the error that caused the transaction to fail
      logger.error(`Error during minting process: ${error}`);

      // Send a general error response to the client
      reply.status(500).send({ error: `Failed to process mint request: ${error}` });
    }
  }
});

fastify.get("/get-mint-request/:referenceId", async (request: FastifyRequest<{ Params: { referenceId: string } }>, reply: FastifyReply) => {
  const { referenceId } = request.params;

  try {
    const response = await axios.get(`${serverConfig[environment].API_URL}/v1/chains/${serverConfig[environment].chainName}/collections/${serverConfig[environment].collectionAddress}/nfts/mint-requests/${referenceId}`, {
      headers: {
        "x-immutable-api-key": serverConfig[environment].HUB_API_KEY,
        "x-api-key": serverConfig[environment].RPS_API_KEY,
      },
    });

    reply.send(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error("Error querying mint request:", error.message);
      console.log(error.message);
      reply.status(error.response?.status || 500).send({ error: "Failed to query mint request" });
    } else {
      logger.error("Unexpected error querying mint request:", error);
      reply.status(500).send({ error: "An unexpected error occurred" });
    }
  }
});

if (serverConfig[environment].enableWebhookVerification) {
  fastify.post("/webhook", async (request: any, reply: any) => {
    console.log(request);
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
              updateUUIDStatus(reference_id, "succeeded", prisma);
            } else if (status === "pending") {
              logger.debug(`Mint request ${reference_id} is pending`);
            } else if (status === "failed") {
              logger.warn(`Mint request ${reference_id} failed for owner address ${owner_address}`);
              updateUUIDStatus(reference_id, "failed", prisma);
            }
          } else {
            logger.warn("Received notification for an unknown event:");
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
}

// Start the server
const start = async () => {
  try {
    // if (!checkConfigValidity(serverConfig[environment])) {
    //   throw new Error("Invalid server configuration. Exiting.");
    // }
    try {
      const response = await axios.get(IMX_JWT_KEY_URL);
      const jwks = response.data;
      jwk = jwks.keys[0];
    } catch (error) {
      logger.error(`Error fetching JWKs: ${error}`);
      throw error;
    }

    totalMintCount = await totalMintCountAcrossAllPhases(prisma);
    logger.info(`Total mint count: ${totalMintCount}`);

    const phases = serverConfig[environment].mintPhases;
    allowlists = await Promise.all(
      phases.map(async (phase, index) => {
        return await readAddressesFromAllowlist(index, prisma);
      })
    );

    allowlists.forEach((allowlist, index) => {
      logger.info(`Addresses on phase ${index}: ${allowlist.length}`);
    });

    logger.info(`Attempting to start on IP ${serverConfig[environment].HOST_IP} and port ${serverConfig[environment].PORT}...`);

    await fastify.listen({
      port: serverConfig[environment].PORT,
      host: serverConfig[environment].HOST_IP,
    });

    logger.info(`Server started successfully on port ${serverConfig[environment].PORT}.`);

    if (returnActivePhase() === null) {
      logger.warn("No active mint phase found.");
    } else {
      logger.info(`Active phase: ${returnActivePhase()}`);
    }
  } catch (err) {
    logger.error(`Error starting server: ${err}`);
    // Optionally, you might want to handle specific errors differently here
    process.exit(1);
  }
};

start();
