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
    validator.validate(webhookPayload, (err: Error) => {
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

export async function readAddressesFromFile(filePath: string) {
  try {
    const data = fs.readFileSync(filePath, { encoding: "utf-8" });
    const addresses = data.split("\n").filter((line) => line.length > 0); // Assuming one address per line
    return addresses;
  } catch (error) {
    console.error("Error reading file:", error);
    return [];
  }
}

// export function checkConfigValidity(config) {
//   const { mintPhases, maxTokenSupplyAcrossAllPhases } = config;
//   const currentTime = Math.floor(Date.now() / 1000); // current time in seconds

//   let totalTokens = 0;
//   let lastEndTime = 0;
//   let tokenRanges = [];

//   for (let i = 0; i < mintPhases.length; i++) {
//     const phase = mintPhases[i];

//     // Check if phase is currently active or has passed
//     if (currentTime >= phase.startTime && currentTime <= phase.endTime) {
//       logger.warn(`Phase "${phase.name}" is currently active.`);
//     } else if (currentTime > phase.endTime) {
//       logger.warn(`Phase "${phase.name}" has already ended.`);
//     }

//     // Existing checks...
//     if (phase.enableTokenIDRollOver) {
//       // Conditions for TokenIDRollOver...
//     } else {
//       // Conditions for standard token ID management...
//       for (const range of tokenRanges) {
//         // Check for token ID range overlaps...
//       }
//       tokenRanges.push({ startTokenID: phase.startTokenID, endTokenID: phase.endTokenID });
//       totalTokens += phase.endTokenID - phase.startTokenID + 1;
//     }

//     // Check for overlapping phase times...
//     if (phase.startTime <= lastEndTime) {
//       logger.error(`Phase time overlap detected between phases ending at ${lastEndTime} and starting at ${phase.startTime}`);
//       return false;
//     }
//     lastEndTime = phase.endTime;

//     // Check for maxTokensPerWallet when allowlist is enabled...
//   }

//   // Check if maxTokenSupplyAcrossAllPhases is exceeded...
//   if (maxTokenSupplyAcrossAllPhases !== undefined && totalTokens > maxTokenSupplyAcrossAllPhases) {
//     logger.error(`Total token supply across all phases (${totalTokens}) exceeds the configured maximum (${maxTokenSupplyAcrossAllPhases}).`);
//     return false;
//   }

//   logger.info("All config checks passed.");
//   return true;
// }
