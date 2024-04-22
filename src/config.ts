import { config } from "@imtbl/sdk";
require("dotenv").config();

export const environment = config.Environment.SANDBOX;

export const IMX_JWT_KEY_URL = "https://auth.immutable.com/.well-known/jwks.json?_gl=1*1g7a0qs*_ga*NDg1NTg3MDI3LjE2ODU1OTY1Mzg.*_ga_4JBHZ7F06X*MTY4ODUyNjkyNy4xNC4wLjE2ODg1MjY5MjcuMC4wLjA.*_ga_7XM4Y7T8YC*MTY4ODUyNjkyNy4yNy4wLjE2ODg1MjY5MjcuMC4wLjA.";

const serverConfig = {
  [config.Environment.SANDBOX]: {
    API_URL: "https://api.sandbox.immutable.com",
    API_KEY: process.env.SANDBOX_IMMUTABLE_API_KEY,
    chainName: "imtbl-zkevm-testnet",
    collectionAddress: "0x88b87272649b3495d99b1702f358286b19f8c3da",
    DATABASE_URL: process.env.SANDBOX_DATABASE_URL,
    mintSuccessPollingFrequency: 1000,
    mintSuccessPollingRetries: 15,
    mintRequestURL: (chainName: string, collectionAddress: string, referenceId: string) => `https://api.sandbox.immutable.com/v1/chains/${chainName}/collections/${collectionAddress}/nfts/mint-requests/${referenceId}`,
    WEBHOOK_URL: process.env.SANDBOX_WEBHOOK_URL,
    allowedTopicArn: "arn:aws:sns:us-east-2:783421985614:*",
  },
  [config.Environment.PRODUCTION]: {
    API_URL: "https://api.immutable.com",
    API_KEY: process.env.MAINNET_IMMUTABLE_API_KEY,
    chainName: "imtbl-zkevm-mainnet",
    collectionAddress: "0x88b87272649b3495d99b1702f358286b19f8c3da",
    DATABASE_URL: process.env.MAINNET_DATABASE_URL,
    mintSuccessPollingFrequency: 1000,
    mintSuccessPollingRetries: 15,
    mintRequestURL: (chainName: string, collectionAddress: string, referenceId: string) => `https://api.immutable.com/v1/chains/${chainName}/collections/${collectionAddress}/nfts/mint-requests/${referenceId}`,
    WEBHOOK_URL: process.env.MAINNET_WEBHOOK_URL,
    allowedTopicArn: "arn:aws:sns:us-east-2:362750628221:*",
  },
};

export default serverConfig;
