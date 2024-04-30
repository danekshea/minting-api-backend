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
import { ServerConfig, PassportIDToken, NFTMetadata } from "./types";

//Used with all utils and database functions to ensure logging happens correctly and everything is in a try catch block
export async function executeWithLogging<T>(operation: () => Promise<T>, description: string): Promise<T> {
  try {
    const result = await operation();
    logger.debug(`[SUCCESS] ${description}`);
    return result;
  } catch (error: any) {
    logger.error(`[FAILURE] ${description}`, { error });
    throw new Error(`Error during ${description.toLowerCase()}: ${error.message}`);
  }
}

//Verifies the Passport JWT token
export async function verifyPassportToken(IDtoken: string): Promise<void> {
  return executeWithLogging(async () => {
    const response = await axios.get(IMX_JWT_KEY_URL);
    const jwks = response.data;
    const jwk = jwks.keys[0];
    const pem = jwkToPem(jwk);
    const verifyPromise = promisify(jwt.verify);
    await verifyPromise(IDtoken, pem, { algorithms: ["RS256"] });
  }, "Verifying JWT token");
}

//Base64 decodes the Passport token
export async function decodePassportToken(IDtoken: string): Promise<PassportIDToken> {
  return executeWithLogging(async () => {
    const decoded: PassportIDToken = jwt.decode(IDtoken, { complete: true });
    return decoded;
  }, "Decoding JWT token");
}

export async function verifySNSSignature(webhookPayload: string): Promise<boolean> {
  return executeWithLogging(() => {
    return new Promise((resolve, reject) => {
      validator.validate(webhookPayload, (err) => {
        if (err) {
          reject(false);
        } else {
          resolve(true);
        }
      });
    });
  }, "Verifying SNS signature");
}

export async function getMetadataByTokenId(metadataDir: string, tokenId: string): Promise<NFTMetadata | null> {
  return executeWithLogging(async () => {
    const filePath = path.join(metadataDir, `${tokenId}`);
    try {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const metadata: NFTMetadata = JSON.parse(fileContent);
      return metadata;
    } catch (error) {
      return null;
    }
  }, `Getting metadata for token ID ${tokenId}`);
}

export async function getPhaseForTokenID(tokenID: number): Promise<number | null> {
  return executeWithLogging(async () => {
    for (let i = 0; i < serverConfig[environment].mintPhases.length; i++) {
      const phase = serverConfig[environment].mintPhases[i];
      if (tokenID >= phase.startTokenID && tokenID <= phase.endTokenID) {
        return i;
      }
    }
    return null;
  }, `Getting phase for token ID ${tokenID}`);
}

async function checkConfigValidity(config: ServerConfig): Promise<boolean> {
  return executeWithLogging(async () => {
    const { mintPhases, maxTokenSupplyAcrossAllPhases } = config;

    let totalTokens = 0;
    let lastEndTime = 0;
    let tokenRanges = [];

    for (const phase of mintPhases) {
      // Check for overlapping phase times
      if (phase.startTime <= lastEndTime) {
        throw new Error(`Phase time overlap detected between phases ending at ${lastEndTime} and starting at ${phase.startTime}`);
      }
      lastEndTime = phase.endTime;

      // Check for token ID range overlaps
      for (const range of tokenRanges) {
        if ((phase.startTokenID <= range.endTokenID && phase.startTokenID >= range.startTokenID) || (phase.endTokenID <= range.endTokenID && phase.endTokenID >= range.startTokenID)) {
          throw new Error(`Token ID range overlap detected between token IDs ${range.startTokenID}-${range.endTokenID} and ${phase.startTokenID}-${phase.endTokenID}`);
        }
      }
      tokenRanges.push({ startTokenID: phase.startTokenID, endTokenID: phase.endTokenID });

      // Accumulate total token count
      totalTokens += phase.endTokenID - phase.startTokenID + 1;

      // Check for maxTokensPerWallet when no allowlist is enabled
      if (!phase.enableAllowList && phase.maxTokensPerWallet === undefined) {
        throw new Error(`No maxTokensPerWallet defined for phase "${phase.name}" which has no allowlist.`);
      }
    }

    // Check if maxTokenSupplyAcrossAllPhases is exceeded
    if (totalTokens > maxTokenSupplyAcrossAllPhases) {
      throw new Error(`Total token supply across all phases (${totalTokens}) exceeds the configured maximum (${maxTokenSupplyAcrossAllPhases}).`);
    }

    return true; // All checks passed
  }, "Config Validity Check");
}
