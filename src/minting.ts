import { blockchainData, config as sdkConfig } from "@imtbl/sdk";
import { v4 as uuidv4 } from "uuid";
import serverConfig from "./config";
import { environment } from "./config";

export const mintByMintingAPI = async (contractAddress: string, walletAddress: string, tokenID?: string): Promise<string> => {
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

  const chainName = "imtbl-zkevm-testnet";

  const uuid = uuidv4();

  const response = await client.createMintRequest({
    chainName: serverConfig[environment].chainName,
    contractAddress,
    createMintRequestRequest: {
      assets: [
        {
          owner_address: walletAddress,
          reference_id: uuid,
          //Remove token_id line if you want to batch mint
          token_id: tokenID || null,
          metadata: {
            name: "Homer",
            description: null,
            image: "https://raw.githubusercontent.com/danekshea/imx-zkevm-testing-kit/master/data/chessnfts/metadata/homer.gif",
            animation_url: "https://raw.githubusercontent.com/danekshea/imx-zkevm-testing-kit/master/data/chessnfts/metadata/homer2.gif",
            youtube_url: null,
            attributes: [],
          },
        },
      ],
    },
  });
  console.log(`Mint request sent with UUID: ${uuid}`);
  return uuid;
};
