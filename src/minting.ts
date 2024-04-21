import { blockchainData, config as sdkConfig } from "@imtbl/sdk";
import { v4 as uuidv4 } from "uuid";
import serverConfig from "./config";
import { environment } from "./config";
import axios from "axios";

export const mintByMintingAPI = async (contractAddress: string, walletAddress: string): Promise<string> => {
  //Remember to grant the minting role to the mintingAPIAddress
  const config: blockchainData.BlockchainDataModuleConfiguration = {
    baseConfig: new sdkConfig.ImmutableConfiguration({
      environment: sdkConfig.Environment.SANDBOX,
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
    chainName,
    contractAddress,
    createMintRequestRequest: {
      assets: [
        {
          owner_address: walletAddress,
          reference_id: uuid,
          //Remove token_id line if you want to batch mint
          //token_id: "2",
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

export async function mintStatusSucceeded(referenceId: string): Promise<boolean> {
  let retries = 0;
  const { chainName, collectionAddress, mintRequestURL, API_KEY } = serverConfig[environment];

  while (retries < serverConfig[environment].mintSuccessPollingRetries) {
    try {
      const response = await axios.get(mintRequestURL(chainName, collectionAddress, referenceId), {
        headers: {
          Accept: "application/json",
          "x-immutable-api-key": API_KEY,
        },
      });

      console.log(`Status: ${JSON.stringify(response.data.result[0].status)}`);

      if (response.data.result[0].status === "succeeded") {
        console.log("Mint request succeeded!");
        return true;
      }
    } catch (error) {
      console.error("Error polling mint status:", error);
    }

    retries++;
    await new Promise((resolve) => setTimeout(resolve, serverConfig[environment].mintSuccessPollingFrequency));
  }

  return false;
}
