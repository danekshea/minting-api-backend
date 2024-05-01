import { config } from "@imtbl/sdk";
import { ServerConfig } from "./types";
require("dotenv").config();

//config.Environment.SANDBOX or config.Environment.PRODUCTION
export const environment = config.Environment.SANDBOX;

//Used for verification of the Passport JWTs
export const IMX_JWT_KEY_URL = "https://auth.immutable.com/.well-known/jwks.json?_gl=1*1g7a0qs*_ga*NDg1NTg3MDI3LjE2ODU1OTY1Mzg.*_ga_4JBHZ7F06X*MTY4ODUyNjkyNy4xNC4wLjE2ODg1MjY5MjcuMC4wLjA.*_ga_7XM4Y7T8YC*MTY4ODUyNjkyNy4yNy4wLjE2ODg1MjY5MjcuMC4wLjA.";

const serverConfig: ServerConfig = {
  [config.Environment.SANDBOX]: {
    API_URL: "https://api.sandbox.immutable.com",
    API_KEY: process.env.SANDBOX_IMMUTABLE_API_KEY!,
    chainName: "imtbl-zkevm-testnet",
    collectionAddress: "0x76bedf3f6d486922d77db2e1a43cea4bf9c22ef7",
    mintRequestURL: (chainName: string, collectionAddress: string, referenceId: string) => `https://api.sandbox.immutable.com/v1/chains/${chainName}/collections/${collectionAddress}/nfts/mint-requests/${referenceId}`,
    allowedTopicArn: "arn:aws:sns:us-east-2:783421985614:*", //Used for webhook SNS verification
    metadataDir: "tokens/metadata", //Where the token metadata resides, {filename} will be replaced with the token ID
    maxTokenSupplyAcrossAllPhases: 10000,
    enableFileLogging: true, //Should logs be output to files or just console?
    logLevel: "debug",
    eoaMintMessage: "Sign this message to verify your wallet address", //The message an EOA signs to verify their wallet address and mint
    mintPhases: [
      {
        name: "Presale",
        startTime: 1629913600,
        endTime: 1714570314,
        startTokenID: 6015,
        endTokenID: 6020,
        enableAllowList: true,
      },
      {
        name: "Public Sale",
        startTime: 1714570315,
        endTime: 1719292800,
        maxTokenSupply: 5,
        enableTokenIDRollOver: true,
        enableAllowList: false,
        maxTokensPerWallet: 25,
      },
    ],
  },
  [config.Environment.PRODUCTION]: {
    API_URL: "https://api.immutable.com",
    API_KEY: process.env.MAINNET_IMMUTABLE_API_KEY!,
    chainName: "imtbl-zkevm-mainnet",
    collectionAddress: "0x88b87272649b3495d99b1702f358286b19f8c3da",
    mintRequestURL: (chainName: string, collectionAddress: string, referenceId: string) => `https://api.immutable.com/v1/chains/${chainName}/collections/${collectionAddress}/nfts/mint-requests/${referenceId}`,
    allowedTopicArn: "arn:aws:sns:us-east-2:362750628221:*", //Used for webhook SNS verification
    metadataDir: "tokens/metadata", //Where the token metadata resides, {filename} will be replaced with the token ID
    enableFileLogging: true, //Should logs be output to files or just console?
    logLevel: "debug",
    eoaMintMessage: "Sign this message to verify your wallet address", //The message an EOA signs to verify their wallet address and mint
    mintPhases: [
      {
        name: "Presale",
        startTime: 1629913600,
        endTime: 1714397828,
        startTokenID: 6,
        endTokenID: 1000,
        enableAllowList: true,
      },
      {
        name: "Public Sale",
        startTime: 1714397829,
        endTime: 1719292800,
        startTokenID: 2027,
        endTokenID: 3000,
        enableAllowList: false,
        maxTokensPerWallet: 5,
      },
    ],
  },
};

export default serverConfig;
