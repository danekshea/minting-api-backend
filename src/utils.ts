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

export async function verifyToken(IDtoken: string): Promise<void> {
  try {
    const response = await axios.get(IMX_JWT_KEY_URL);
    const jwks = response.data;
    const jwk = jwks.keys[0];
    const pem = jwkToPem(jwk);
    const verifyPromise = promisify(jwt.verify);

    try {
      const decoded = await verifyPromise(IDtoken, pem, { algorithms: ["RS256"] });
      logger.info("JWT verified:", decoded);
    } catch (err) {
      logger.error("JWT verification failed:", err);
      throw err;
    }
  } catch (error) {
    logger.error("Error during token verification:", error);
    throw error;
  }
}

export async function decodeToken(IDtoken: string): Promise<PassportIDToken> {
  const decoded: PassportIDToken = jwt.decode(IDtoken, { complete: true });
  logger.debug("Decoded JWT:", decoded);
  return decoded;
}

export async function verifySNSSignature(webhookPayload: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    validator.validate(webhookPayload, (err) => {
      if (err) {
        logger.error("Signature validation failed:", err);
        reject(false);
      } else {
        logger.info("Signature verification successful");
        resolve(true);
      }
    });
  });
}

export async function getMetadataByTokenId(metadataDir: string, tokenId: string): Promise<NFTMetadata | null> {
  const filePath = path.join(metadataDir, `${tokenId}`);
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const metadata: NFTMetadata = JSON.parse(fileContent);
    logger.debug(`Loaded metadata for token ID ${tokenId}:`, metadata);
    return metadata;
  } catch (error) {
    logger.error(`Error loading metadata for token ID ${tokenId}:`, error);
    return null;
  }
}
