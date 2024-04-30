const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");
const axios = require("axios");
import { promisify } from "util";
import serverConfig, { IMX_JWT_KEY_URL, environment } from "./config";
import path from "path";
const SnsValidator = require("sns-validator");
const validator = new SnsValidator();
import fs from "fs";
import logger from "./logger";
import { NFTMetadata, PassportIDToken, ServerConfig } from "./types";

// Function to verify the JWT token
export async function verifyPassportToken(IDtoken: string): Promise<void> {
  try {
    const response = await axios.get(IMX_JWT_KEY_URL);
    const jwks = response.data;
    const jwk = jwks.keys[0];
    const pem = jwkToPem(jwk);
    const verifyPromise = promisify(jwt.verify);

    try {
      const decoded = await verifyPromise(IDtoken, pem, { algorithms: ["RS256"] });
      // Stringify the decoded token to log the details properly
      logger.info(`JWT verified: ${JSON.stringify(decoded, null, 2)}`);
    } catch (err) {
      // Stringify the error to display all its properties
      logger.error(`JWT verification failed: ${JSON.stringify(err, null, 2)}`);
      throw err;
    }
  } catch (error) {
    // Stringify the error to display all its properties
    logger.error(`Error during token verification: ${JSON.stringify(error, null, 2)}`);
    throw error;
  }
}

// Function to decode the JWT token
export async function decodePassportToken(IDtoken: string): Promise<PassportIDToken> {
  const decoded: PassportIDToken = jwt.decode(IDtoken, { complete: true });
  // Ensure the decoded data is logged as a stringified object for clarity
  logger.debug(`Decoded JWT: ${JSON.stringify(decoded, null, 2)}`);
  return decoded;
}

// Function to verify the SNS signature
export async function verifySNSSignature(webhookPayload: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    validator.validate(webhookPayload, (err) => {
      if (err) {
        // Log the error as a stringified object to capture details
        logger.error(`Signature validation failed: ${JSON.stringify(err, null, 2)}`);
        reject(false);
      } else {
        logger.info("Signature verification successful");
        resolve(true);
      }
    });
  });
}

// Function to get metadata by token ID from a local directory
export async function getMetadataByTokenId(metadataDir: string, tokenId: string): Promise<NFTMetadata | null> {
  const filePath = path.join(metadataDir, `${tokenId}`); // Assuming JSON file extension
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const metadata: NFTMetadata = JSON.parse(fileContent);
    // Log the loaded metadata as a stringified object
    logger.debug(`Loaded metadata for token ID ${tokenId}: ${JSON.stringify(metadata, null, 2)}`);
    return metadata;
  } catch (error) {
    // Log the error as a stringified object
    logger.error(`Error loading metadata for token ID ${tokenId}: ${JSON.stringify(error, null, 2)}`);
    return null;
  }
}

// Function to determine which minting phase a token ID belongs to
export async function getPhaseForTokenID(tokenID: number): Promise<number | null> {
  // Check each mint phase to see if the tokenID falls within the startTokenID and endTokenID range
  for (let i = 0; i < serverConfig[environment].mintPhases.length; i++) {
    const phase = serverConfig[environment].mintPhases[i];
    if (tokenID >= phase.startTokenID && tokenID <= phase.endTokenID) {
      // Return the index of the phase
      return i;
    }
  }

  // Return null if the token ID does not fall within any phase range
  return null;
}

export function checkConfigValidity(config) {
  const { mintPhases, maxTokenSupplyAcrossAllPhases } = config;

  let totalTokens = 0;
  let lastEndTime = 0;
  let tokenRanges = [];

  for (const phase of mintPhases) {
    // Check for overlapping phase times
    if (phase.startTime <= lastEndTime) {
      logger.error(`Phase time overlap detected between phases ending at ${lastEndTime} and starting at ${phase.startTime}`);
      return false;
    }
    lastEndTime = phase.endTime;

    // Check for token ID range overlaps
    for (const range of tokenRanges) {
      if ((phase.startTokenID <= range.endTokenID && phase.startTokenID >= range.startTokenID) || (phase.endTokenID <= range.endTokenID && phase.endTokenID >= range.startTokenID)) {
        logger.error(`Token ID range overlap detected between token IDs ${range.startTokenID}-${range.endTokenID} and ${phase.startTokenID}-${phase.endTokenID}`);
        return false;
      }
    }
    tokenRanges.push({ startTokenID: phase.startTokenID, endTokenID: phase.endTokenID });

    // Accumulate total token count
    totalTokens += phase.endTokenID - phase.startTokenID + 1;

    // Check for maxTokensPerWallet when no allowlist is enabled
    if (!phase.enableAllowList && phase.maxTokensPerWallet === undefined) {
      logger.error(`No maxTokensPerWallet defined for phase "${phase.name}" which has no allowlist.`);
      return false;
    }
  }

  // Check if maxTokenSupplyAcrossAllPhases is exceeded
  if (totalTokens > maxTokenSupplyAcrossAllPhases) {
    logger.error(`Total token supply across all phases (${totalTokens}) exceeds the configured maximum (${maxTokenSupplyAcrossAllPhases}).`);
    return false;
  }

  logger.info("All config checks passed.");
  return true;
}
