const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
import { FastifyReply, FastifyRequest } from "fastify";
import serverConfig from "./config";
import { environment } from "./config";
import { mintByMintingAPI, mintStatusSucceeded } from "./minting";
import { verifyToken, decodeToken } from "./utils";
import { isAllowlisted, markAddressAsMinted } from "./database";

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

fastify.post("/mint", async (request: FastifyRequest, reply: FastifyReply) => {
  const authorizationHeader = request.headers["authorization"];

  if (!authorizationHeader) {
    reply.status(401).send({ error: "Missing authorization header" });
    return;
  }

  const idToken = authorizationHeader.replace("Bearer ", "");

  try {
    //Verify and decode the IDToken, should throw an error if the signature is invalid
    await verifyToken(idToken);
    const decodedToken = await decodeToken(idToken);

    const walletAddress = decodedToken.payload.passport.zkevm_eth_address;

    // Check if the wallet address is allowed to mint
    const isAllowed = await isAllowlisted(walletAddress);
    if (!isAllowed) {
      reply.status(403).send({ error: "Wallet address not allowed to mint" });
      return;
    }

    const uuid = await mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress);

    // Prepare the response
    const response = {
      walletAddress,
      uuid,
    };

    // Send the response
    reply.send(response);

    //if mint status succeeded mark the address as minted
    const mintSucceeded = await mintStatusSucceeded(uuid);
    console.log("Minting succeeded:", mintSucceeded);
    if (mintSucceeded) {
      console.log("Marking address as minted");
      await markAddressAsMinted(walletAddress);
    } else {
      console.log("Minting failed");
    }
  } catch (err) {
    fastify.log.error("Failed to verify ID token:", err);
    reply.status(401).send({ error: "Invalid ID token" });
    return; // Stop further execution
  }
});

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
