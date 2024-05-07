import { PrismaClient } from "@prisma/client";
import logger from "../logger";
import axios from "axios";
import serverConfig, { environment } from "../config";

export async function queryAndCorrectPendingMints(prisma: PrismaClient): Promise<void> {
  try {
    const pendingMints = await prisma.mints.findMany({
      where: { status: "pending" },
    });
    // Check if there are any pending mints and log them if there are
    if (pendingMints.length > 0) {
      logger.debug(`Pending mints: ${JSON.stringify(pendingMints, null, 2)}`);
    }
    for (const mint of pendingMints) {
      try {
        const uuid = mint.uuid;
        const response = await axios.get(serverConfig[environment].mintRequestURL(serverConfig[environment].chainName, serverConfig[environment].collectionAddress, uuid), {
          headers: {
            "x-immutable-api-key": serverConfig[environment].API_KEY,
          },
        });
        logger.debug(`Checking status of mint with UUID ${uuid}: ${JSON.stringify(response.data, null, 2)}`);

        if (response.data.result[0].status === "succeeded") {
          await prisma.$transaction(async (prisma) => {
            // Update the status of minted tokens
            await prisma.mints.updateMany({
              where: { uuid },
              data: { status: "succeeded" },
            });

            // Log the successful mint
            logger.info(`Mint with UUID ${uuid} succeeded. Updating status.`);
          });
        } else if (response.data.result[0].status === "failed") {
          await prisma.mints.updateMany({
            where: { uuid },
            data: { status: "failed" },
          });
          logger.info(`Mint with UUID ${uuid} failed. Updating status.`);
        }
      } catch (error) {
        logger.error(`Error processing mint with UUID ${mint.uuid}: ${JSON.stringify(error, null, 2)}`);
      }
    }
  } catch (error) {
    logger.error(`Error fetching pending mints: ${JSON.stringify(error, null, 2)}`);
  }
}

(async () => {
  const prisma = new PrismaClient();
  await queryAndCorrectPendingMints(prisma);
})();
