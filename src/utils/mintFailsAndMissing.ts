import { PrismaClient } from "@prisma/client";
import logger from "../logger";
import axios from "axios";
import serverConfig, { environment } from "../config";
import { mintByMintingAPI } from "../minting";

export async function mintFailsAndMissing(prisma: PrismaClient): Promise<void> {
  try {
    const pendingMints = await prisma.mints.findMany({
      where: {
        status: {
          not: "succeeded",
        },
      },
    });
    for (const mint of pendingMints) {
      try {
        const uuid = mint.uuid;
        const response = await axios.get(serverConfig[environment].mintRequestURL(serverConfig[environment].chainName, serverConfig[environment].collectionAddress, uuid), {
          headers: {
            "x-immutable-api-key": serverConfig[environment].API_KEY,
          },
        });
        logger.debug(`Checking status of mint with UUID ${uuid}: ${JSON.stringify(response.data, null, 2)}`);
        if (response.data.result.length > 0) {
          if (response.data.result[0].status === "failed") {
            mintByMintingAPI(serverConfig[environment].collectionAddress, mint.address, uuid, mint.metadata);
            await prisma.mints.updateMany({
              where: { uuid },
              data: { status: "failed" },
            });
            logger.info(`Mint with UUID ${uuid} failed. Updating status.`);
          }
        } else {
          logger.error(`No mint found with UUID ${uuid}.`);
        }
      } catch (error) {
        logger.error(`Error processing mint with UUID ${mint.uuid}.`);
        console.log(error);
      }
    }
  } catch (error) {
    logger.error(`Error fetching pending mints: ${JSON.stringify(error, null, 2)}`);
  }
}

(async () => {
  const prisma = new PrismaClient();
  await mintFailsAndMissing(prisma);
})();
