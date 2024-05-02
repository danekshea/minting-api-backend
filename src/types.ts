import { FastifyRequest } from "fastify";

export interface MintPhase {
  name: string;
  startTime: number;
  endTime: number;
  startTokenID?: number; // Optional since enableTokenIDRollOver may negate its necessity
  endTokenID?: number; // Optional if maxTokenSupply is used with enableTokenIDRollOver
  enableAllowList: boolean;
  enableTokenIDRollOver?: boolean; // Optional since it's not in all phases
  maxTokensPerWallet?: number; // Optional since it's not in all phases
  maxTokenSupply?: number; // Optional for phases with enableTokenIDRollOver
}

export interface ExtendedMintPhase extends MintPhase {
  totalMinted?: number;
}

interface EnvironmentConfig {
  API_URL: string;
  API_KEY: string;
  chainName: string;
  collectionAddress: string;
  mintRequestURL: (chainName: string, collectionAddress: string, referenceId: string) => string;
  allowedTopicArn: string;
  metadataDir: string;
  maxTokenSupplyAcrossAllPhases?: number; // Optional for generalization
  enableFileLogging: boolean;
  logLevel: string;
  eoaMintMessage: string;
  mintPhases: MintPhase[];
}

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
