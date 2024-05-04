import { PrismaClient, Prisma } from "@prisma/client";
import logger from "./logger";
import serverConfig from "./config";
import { environment } from "./config";
import axios from "axios";
import { ExtendedMintPhase, MintPhase } from "./types";
import { readAddressesFromFile } from "./utils";

const prisma = new PrismaClient();

export async function addTokenMinted(address: string, uuid: string, tx: Prisma.TransactionClient): Promise<void> {
  try {
    await tx.mints.create({
      data: { address, uuid },
    });
    logger.info(`Added minted token with ${uuid} for address ${address}.`);
  } catch (error) {
    logger.error(`Error adding minted token with ${uuid} for address ${address}: ${error}`);
    throw error;
  }
}

async function loadAddressesIntoAllowlist(addresses: string[]) {
  try {
    for (let address of addresses) {
      await prisma.allowlist.create({
        data: {
          address: address,
        },
      });
    }
    console.log("Addresses have been successfully loaded into the database.");
  } catch (error) {
    console.error("Error loading addresses into the database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

export async function readAddressesFromAllowlist(): Promise<string[]> {
  try {
    const addresses = await prisma.allowlist.findMany();
    return addresses.map((address) => address.address);
  } catch (error) {
    console.error("Error reading addresses from the database:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const filePath = "data/addresses.txt"; // Path to the file containing Ethereum addresses
  const addresses = await readAddressesFromFile(filePath);
  if (addresses.length > 0) {
    await loadAddressesIntoAllowlist(addresses);
  } else {
    console.log("No addresses to load.");
  }
  // try {
  //   const addresses = await readAddressesFromAllowlist();
  //   addresses.forEach((address) => console.log(address));
  // } catch (error) {
  //   console.error("Error reading addresses from the database:", error);
  // }
}

main();
