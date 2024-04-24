const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");
const axios = require("axios");
import { promisify } from "util";
import { IMX_JWT_KEY_URL } from "./config";
import { createVerify } from "crypto";
import path from "path";
const SnsValidator = require("sns-validator");
const validator = new SnsValidator();
import fs from "fs";
import logger from "./logger";

// Function to verify the JWT token
export async function verifyToken(IDtoken: string): Promise<void> {
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
export async function decodeToken(IDtoken: string): Promise<PassportIDToken> {
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
