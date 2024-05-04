// Import necessary libraries and modules
const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
import { FastifyReply, FastifyRequest } from "fastify";
import serverConfig from "./config";
import { environment } from "./config";
import { mintByMintingAPI } from "./minting";
import { verifyPassportToken, decodePassportToken, verifySNSSignature, checkConfigValidity, checkCurrentMintPhaseIsActive, getMetadataByTokenId, readAddressesFromFile } from "./utils";
import { addTokenMinted, readAddressesFromAllowlist } from "./database";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import logger from "./logger";
import { ExtendedMintPhase, MintPhase, eoaMintRequest } from "./types";
import { recoverMessageAddress, verifyMessage } from "viem";
import { ethers } from "ethers";
import { v4 as uuidv4 } from "uuid";
import { Prisma } from "@prisma/client";
import { error } from "console";

// Initialize Prisma Client for database interactions
const prisma = new PrismaClient();
let allowlist: string[] = [];

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
        // Retrieve metadata for the token and initiate the minting process
        const metadata = {
          image: "https://emerald-variable-swallow-254.mypinata.cloud/ipfs/QmNYn1DS9djwCLCcu7Pyrb6uUtGzf29AH6cBcXAncELeik/1.png",
          name: "Copypasta #1",
          description: "1 of many in the Copypasta NFTs collection",
          attributes: [
            {
              trait_type: "Id",
              value: "1",
            },
          ],
        };
        const uuid = await mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress, metadata);

        await addTokenMinted(walletAddress, uuid, tx);

        // Send response with wallet address and UUID of the mint
        return { collectionAddress: serverConfig[environment].collectionAddress, walletAddress, uuid };
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
  console.log("Request body is: ", request.body);

  const { signature } = request.body;
  const message = serverConfig[environment].eoaMintMessage;

  // Attempt to recover wallet address from the signature
  let walletAddress: `0x${string}`;

  try {
    walletAddress = await recoverMessageAddress({ message, signature });
    logger.info(`Recovered wallet address: ${walletAddress} from signature: ${signature}`);
  } catch (error) {
    logger.warn(`Failed to recover wallet address: ${error}`);
    reply.status(401).send({ error: "Failed to verify signature." });
    return;
  }

  try {
    if (allowlist.includes(walletAddress)) {
      logger.info(`Wallet address ${walletAddress} is on the allowlist.`);
    } else {
      logger.warn(`Wallet address ${walletAddress} is not on the allowlist.`);
      reply.status(401).send({ error: "Wallet address is not on the allowlist." });
      return;
    }
  } catch (error) {
    logger.error(`Error checking allowlist: ${error}`);
    reply.status(500).send({ error: "Failed to check allowlist." });
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

  const metadata = {
    name: "Paradise Pass",
    description:
      "Unlock the Gold tier in Paradise Pass with the Paradise Pass Gold NFT! Take part in daily and weekly challenges, or just hold the NFT and occasionally visit your Paradise Island to earn Moani tokens. Embark on a rewarding journey in Paradise Tycoon, both before and after the World Creation Event.",
    image: "https://paradisetycoon.com/nft/ppass/media/paradisepass.png",
    animation_url: "https://paradisetycoon.com/nft/ppass/media/paradisepass.mp4",
    attributes: [],
  };
  // Perform the minting process within a transaction
  // Conduct transactional operations related to minting
  const uuid = uuidv4();
  logger.info(`Attempting to mint NFT wallet address ${walletAddress} with UUID ${uuid}`);
  try {
    const result = await prisma.$transaction(async (tx) => {
      try {
        // Record the minting operation in the database
        await addTokenMinted(walletAddress, uuid, tx);

        // If all operations are successful, construct the response object
        return { collectionAddress: serverConfig[environment].collectionAddress, walletAddress, uuid };
      } catch (error) {
        // Log any errors that occur within the transaction and rethrow to trigger a rollback
        logger.error(`Error during transaction: ${error}`);
        throw error;
      }
    });
    // Send the successful result back to the client
    reply.send(result);

    // External API call outside of the transaction
    try {
      await mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress, uuid, metadata);
    } catch (apiError) {
      // Handle API call failure
      logger.error(`Minting API call failed: ${apiError}`);
      throw error;
    }
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
      reply.status(500).send({ error: `Failed to process mint request: ${error.message}` });
    }
  } finally {
    // Ensure the database connection is cleanly disconnected
    await prisma.$disconnect();
    logger.debug("Database connection cleanly disconnected.");
  }
});

fastify.get("/config", async (request: FastifyRequest, reply: FastifyReply) => {
  const environmentConfig = serverConfig[environment];

  try {
    const mintPhases = serverConfig[environment].mintPhases;

    // Use Promise.all to wait for all async operations to complete
    const processedPhases = await Promise.all(
      mintPhases.map(async (phase, index) => {
        const phaseConfig: ExtendedMintPhase = {
          name: phase.name,
          startTime: phase.startTime,
          endTime: phase.endTime,
          enableAllowList: phase.enableAllowList, // Accessing prisma from Fastify instance
        };

        // Include optional properties only if they exist in the phase
        if ("startTokenID" in phase) phaseConfig.startTokenID = phase.startTokenID;
        if ("endTokenID" in phase) phaseConfig.endTokenID = phase.endTokenID;
        if ("maxTokensPerWallet" in phase) phaseConfig.maxTokensPerWallet = phase.maxTokensPerWallet;
        if ("enableTokenIDRollOver" in phase) phaseConfig.enableTokenIDRollOver = phase.enableTokenIDRollOver;
        if ("maxTokenSupply" in phase) phaseConfig.maxTokenSupply = phase.maxTokenSupply;

        return phaseConfig;
      })
    );

    reply.send({
      chainName: environmentConfig.chainName,
      collectionAddress: environmentConfig.collectionAddress,
      maxTokenSupplyAcrossAllPhases: environmentConfig.maxTokenSupplyAcrossAllPhases,
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
  if (!ethers.isAddress(address)) {
    reply.status(400).send({ error: "Invalid address check" });
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

fastify.get("/get-mint-request/:referenceId", async (request: FastifyRequest<{ Params: { referenceId: string } }>, reply: FastifyReply) => {
  const { referenceId } = request.params;

  try {
    const response = await axios.get(`${serverConfig[environment].API_URL}/v1/chains/${serverConfig[environment].chainName}/collections/${serverConfig[environment].collectionAddress}/nfts/mint-requests/${referenceId}`, {
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
    // if (!checkConfigValidity(serverConfig[environment])) {
    //   throw new Error("Invalid server configuration. Exiting.");
    // }
    allowlist = await readAddressesFromAllowlist();

    await fastify.listen(3000);
    logger.info(`Server started successfully on port 3000.`);

    logger.info("Pending mints check completed.");
  } catch (err) {
    logger.error(`Error starting server: ${err.message}`);
    // Optionally, you might want to handle specific errors differently here
    process.exit(1);
  }
};

start();
