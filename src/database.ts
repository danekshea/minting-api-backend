import { PrismaClient, Prisma } from "@prisma/client";
import logger from "./logger";
import serverConfig from "./config";
import { environment } from "./config";
import axios from "axios";
import { ExtendedMintPhase, MintPhase } from "./types";
import { readAddressesFromFile } from "./utils";

export async function addTokenMinted(address: string, uuid: string, phase: number, status: string, prisma: PrismaClient): Promise<void> {
  try {
    await prisma.mints.create({
      data: { address, uuid, phase, status },
    });
    logger.info(`Added minted token with ${uuid} for address ${address}.`);
  } catch (error) {
    logger.error(`Error adding minted token with ${uuid} for address ${address}: ${error}`);
    throw error;
  }
}

async function loadAddressesIntoAllowlist(addresses: string[], phase: number, prisma: PrismaClient) {
  try {
    for (let address of addresses) {
      await prisma.allowlist.create({
        data: {
          address: address.toLowerCase(),
          phase: phase,
        },
      });
    }
    console.log("Addresses have been successfully loaded into the database.");
  } catch (error) {
    console.error("Error loading addresses into the database:", error);
  }
}

export async function readAddressesFromAllowlist(phase: number, prisma: PrismaClient): Promise<string[]> {
  try {
    const addresses = await prisma.allowlist.findMany({
      where: {
        phase: phase,
      },
    });
    return addresses.map((address) => address.address.toLowerCase());
  } catch (error) {
    console.error("Error reading addresses from the database:", error);
    throw error;
  }
}

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

// async function main() {
//   const prisma = new PrismaClient();
//   await queryAndCorrectPendingMints(prisma);
// }
// main();

// async function main() {
//   const prisma = new PrismaClient();
//   const filePath = "data/addresses.txt"; // Path to the file containing Ethereum addresses
//   const addresses = await readAddressesFromFile(filePath);
//   if (addresses.length > 0) {
//     await loadAddressesIntoAllowlist(addresses, 1, prisma);
//   } else {
//     console.log("No addresses to load.");
//   }
//   // try {
//   //   const addresses = await readAddressesFromAllowlist(0);
//   //   addresses.forEach((address) => console.log(address));
//   // } catch (error) {
//   //   console.error("Error reading addresses from the database:", error);
//   // }
// }

// main();
