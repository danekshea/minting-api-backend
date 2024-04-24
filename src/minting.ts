import { blockchainData, config as sdkConfig } from "@imtbl/sdk";
import { v4 as uuidv4 } from "uuid";
import serverConfig from "./config";
import { environment } from "./config";
import logger from "./logger";

export const mintByMintingAPI = async (contractAddress: string, walletAddress: string, metadata: NFTMetadata | null, tokenID?: string): Promise<string> => {
  const config: blockchainData.BlockchainDataModuleConfiguration = {
    baseConfig: new sdkConfig.ImmutableConfiguration({
      environment: environment,
    }),
    overrides: {
      basePath: serverConfig[environment].API_URL,
      headers: {
        "x-immutable-api-key": serverConfig[environment].API_KEY!,
      },
    },
  };

  const client = new blockchainData.BlockchainData(config);
  const uuid = uuidv4();

  const asset: any = {
    owner_address: walletAddress,
    reference_id: uuid,
    token_id: tokenID || null,
  };

  if (metadata !== null) {
    asset.metadata = metadata;
  }

  try {
    const response = await client.createMintRequest({
      chainName: serverConfig[environment].chainName,
      contractAddress,
      createMintRequestRequest: {
        assets: [asset],
      },
    });

    logger.info(`Mint request sent with UUID: ${uuid}`);
    logger.debug("Mint request response:", JSON.stringify(response, null, 2));

    return uuid;
  } catch (error) {
    logger.error("Error sending mint request:", JSON.stringify(error, null, 2));
    throw error;
  }
};
