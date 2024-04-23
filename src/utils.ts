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

export async function verifyToken(IDtoken: string): Promise<void> {
  try {
    const response = await axios.get(IMX_JWT_KEY_URL);
    const jwks = response.data;

    // Select the key you want to use, likely you'll want the first one
    const jwk = jwks.keys[0];

    // Convert the JWK to a PEM
    const pem = jwkToPem(jwk);

    // Convert jwt.verify to a promise-based function
    const verifyPromise = promisify(jwt.verify);

    try {
      const decoded = await verifyPromise(IDtoken, pem, { algorithms: ["RS256"] });
      console.log("JWT verified:", decoded);
    } catch (err) {
      console.log("JWT verification failed:", err);
      throw err;
    }
  } catch (error) {
    console.error("Error during token verification:", error);
    throw error;
  }
}

export async function decodeToken(IDtoken: string): Promise<PassportIDToken> {
  const decoded: PassportIDToken = jwt.decode(IDtoken, { complete: true });
  //console.log("Decoded JWT:", decoded);
  return decoded;
}

export async function verifySNSSignature(webhookPayload: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    validator.validate(webhookPayload, (err) => {
      if (err) {
        console.error("Signature validation failed:", err);
        reject(false);
      } else {
        console.log("Signature verification successful");
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
    return metadata;
  } catch (error) {
    console.error(`Error loading metadata for token ID ${tokenId}:`, error);
    return null;
  }
}
