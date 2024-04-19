import { config } from "@imtbl/sdk";
require("dotenv").config();

export const environment = config.Environment.SANDBOX;

export const IMX_JWT_KEY_URL = "https://auth.immutable.com/.well-known/jwks.json?_gl=1*1g7a0qs*_ga*NDg1NTg3MDI3LjE2ODU1OTY1Mzg.*_ga_4JBHZ7F06X*MTY4ODUyNjkyNy4xNC4wLjE2ODg1MjY5MjcuMC4wLjA.*_ga_7XM4Y7T8YC*MTY4ODUyNjkyNy4yNy4wLjE2ODg1MjY5MjcuMC4wLjA.";

const serverConfig = {
  [config.Environment.SANDBOX]: {
    API_URL: "https://api.sandbox.immutable.com",
    API_KEY: process.env.SANDBOX_IMMUTABLE_API_KEY,
    collectionAddress: "0x88b87272649b3495d99b1702f358286b19f8c3da",
  },
  [config.Environment.PRODUCTION]: {
    API_URL: "https://api.immutable.com",
    API_KEY: process.env.MAINNET_IMMUTABLE_API_KEY,
    collectionAddress: "0x88b87272649b3495d99b1702f358286b19f8c3da",
  },
};

export default serverConfig;
