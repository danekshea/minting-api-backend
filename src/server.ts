const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
import { blockchainData, config as sdkConfig } from "@imtbl/sdk";
import { v4 as uuidv4 } from "uuid";

// //Disables CORS altogether
// fastify.register(cors, {
//   origin: true,
// });

//Change this once the actual API goes live
fastify.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// Define a route
fastify.get("/", (request, reply) => {
  reply.send({ hello: "world" });
});

fastify.get("/mint", (request, reply) => {
  reply.send({ hello: "mint" });
});

const mintByMintingAPI = async (contractAddress: string): Promise<blockchainData.Types.CreateMintRequestResult> => {
  //Remember to grant the minting role to the mintingAPIAddress
  const config: blockchainData.BlockchainDataModuleConfiguration = {
    baseConfig: new sdkConfig.ImmutableConfiguration({
      environment: sdkConfig.Environment.SANDBOX,
    }),
    overrides: {
      basePath: API_URL,
      headers: {
        "x-immutable-api-key": process.env.IMMUTABLE_API_KEY!,
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
          owner_address: "0x9648d4bf782c02bf140562711ae138e3ad113b8a",
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
  return response;
};

// Start the server
const start = async () => {
  try {
    await fastify.listen(3000);
    fastify.log.info(`Server running on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
