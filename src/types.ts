import { FastifyRequest } from "fastify";
import { Signature } from "viem";

// Define a type for individual mint phases
export interface MintPhase {
  name: string;
  startTime: number;
  endTime: number;
  startTokenID: number;
  endTokenID: number;
  enableAllowList: boolean;
  maxTokensPerWallet?: number; // Optional since it's not in all phases
}

// Define a type for the environment configurations
interface EnvironmentConfig {
  API_URL: string;
  API_KEY: string;
  chainName: string;
  collectionAddress: string;
  mintRequestURL: (chainName: string, collectionAddress: string, referenceId: string) => string;
  allowedTopicArn: string;
  metadataDir: string;
  maxTokenSupply?: number; // Optional for generalization, as it might not be in all configs
  maxTokenSupplyAcrossAllPhases?: number; // Optional for generalization
  enableFileLogging: boolean;
  logLevel: string;
  eoaMintMessage: string;
  mintPhases: MintPhase[];
}

// Define a type for the serverConfig object
export interface ServerConfig {
  [key: string]: EnvironmentConfig; // Dynamic keys based on possible environments
}

export type PassportIDToken = {
  header: { alg: "RS256"; typ: "JWT"; kid: "3aaYytdwwe032s1r3TIr9" };
  payload: {
    passport: {
      zkevm_eth_address: string;
      zkevm_user_admin_address: string;
    };
    given_name: string;
    family_name: string;
    nickname: string;
    name: string;
    picture: string;
    locale: string;
    updated_at: string;
    email: string;
    email_verified: boolean;
    iss: string;
    aud: string;
    iat: number;
    exp: number;
    sub: string;
    sid: string;
  };
  signature: string;
};

export interface NFTMetadata {
  image: string;
  name: string;
  description: string;
  attributes: Attribute[];
}

export interface Attribute {
  trait_type: string;
  value: string;
}

export interface eoaMintRequest extends FastifyRequest {
  body: {
    signature: `0x${string}` | Uint8Array | Signature;
    // Add other properties as necessary
  };
}
