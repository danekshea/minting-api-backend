import { blockchainData, config as sdkConfig } from "@imtbl/sdk";
import { v4 as uuidv4 } from "uuid";
import serverConfig from "./config";
import { environment } from "./config";

export const mintByMintingAPI = async (contractAddress: string, walletAddress: string, metadata: NFTMetadata | null, tokenID?: string): Promise<string> => {
  //Remember to grant the minting role to the mintingAPIAddress
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
    // Remove token_id line if you want to batch mint
    token_id: tokenID || null,
  };

  if (metadata !== null) {
    asset.metadata = metadata;
  }

  const response = await client.createMintRequest({
    chainName: serverConfig[environment].chainName,
    contractAddress,
    createMintRequestRequest: {
      assets: [asset],
    },
  });
  console.log(`Mint request sent with UUID: ${uuid}`);
  return uuid;
};
