const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");
const axios = require("axios");
import { promisify } from "util";
import { IMX_JWT_KEY_URL } from "./config";
import { createVerify } from "crypto";
const SnsValidator = require("sns-validator");
const validator = new SnsValidator();

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

// async function main() {
//   console.log(
//     await decodeToken(
//       "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjNhYVl5dGR3d2UwMzJzMXIzVElyOSJ9.eyJwYXNzcG9ydCI6eyJ6a2V2bV9ldGhfYWRkcmVzcyI6IjB4N2NlZWYzZjA5ZjJkM2Q2ZjdhZGQxN2ZmMzViMTI5MDk0ZGZlNmRmNyIsInprZXZtX3VzZXJfYWRtaW5fYWRkcmVzcyI6IjB4N2E1OTM0OWVjZTkyZTNjNjc1OWYwNzQ4ZjJkZWY2YzQwMTBmNGFmNSJ9LCJnaXZlbl9uYW1lIjoiRGFuZSIsImZhbWlseV9uYW1lIjoiU2hlYSIsIm5pY2tuYW1lIjoiZGFuZSIsIm5hbWUiOiJEYW5lIFNoZWEiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jS2Nxa3ZqRUZhdHVpLWxRUURqN0xMY0dCVWhRTTJzQkJtWUh5SkV0bWoyRTFyVUtUOD1zOTYtYyIsImxvY2FsZSI6ImVuIiwidXBkYXRlZF9hdCI6IjIwMjQtMDQtMTlUMTM6Mjg6MDcuOTIzWiIsImVtYWlsIjoiZGFuZUBpbW11dGFibGUuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImlzcyI6Imh0dHBzOi8vYXV0aC5pbW11dGFibGUuY29tLyIsImF1ZCI6Im1qdENMOG10MDZCdGJ4U2twMnZicllTdEtXblhWWmZvIiwiaWF0IjoxNzEzNTMzMjg5LCJleHAiOjE3MTM1MzQxODksInN1YiI6Imdvb2dsZS1vYXV0aDJ8MTE2ODUxNjU4NDM5MzkyNDk3OTk4Iiwic2lkIjoiV1lIZXJRZkRkNFZwSnNIRHd6MlR3cGlLR2lCSmVicEoifQ.IJefO1X2aNpU80AnvSrqx67koXxmGagCB8CS7hfrhvb5bNrG_aiJmj_kMLTSNYSg_n4ZNoUrHr5hcpNjjTIhCdVBOSxbVULVoA5sH_HYrjH7-7TBXgRYl6am1srG6v2vMBGJh0YxXqHrq-KGz_r8WgTkiy7xTSWdLba80CXnysNH-KXZWOd-3IdlYgzMET08k197W5pO8nt55YsIyUYYmpfYSe6TUQiynWbgHNgjT-65lUO7INEae0C1aL9KiQ5HznO_eiqnm2JPLRXq8ZHTgHhhIjVjGWyY0rqMJN4vMQVWunLU8b0loPbbgpkAfw4exbqULYiaLEBk6zSrp2VSUA"
//     )
//   );
// }
// main();
