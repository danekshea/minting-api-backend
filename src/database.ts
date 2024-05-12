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

export async function checkAddressMinted(address: string = "0x42c2d104C05A9889d79Cdcd82F69D389ea24Db9a", prisma: PrismaClient): Promise<string | null> {
  try {
    logger.info(`Checking if user has minted: ${address}`);
    const mintedAddress = await prisma.mints.findUnique({
      where: {
        address: address,
      },
    });
    logger.info(`User has minted: ${mintedAddress !== null}`);
    return mintedAddress?.uuid ?? null;
  } catch (error) {
    logger.error(`Error checking if user has minted: ${error}`);
    throw error;
  }
}

export async function totalMintCountAcrossAllPhases(prisma: PrismaClient): Promise<number> {
  try {
    const mintCount = await prisma.mints.count();
    return mintCount;
  } catch (error) {
    logger.error(`Error getting total mint count: ${error}`);
    throw error;
  }
}

export async function loadAddressesIntoAllowlist(addresses: string[], phase: number, prisma: PrismaClient) {
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

export async function updateUUIDStatus(uuid: string, status: string, prisma: PrismaClient): Promise<void> {
  try {
    await prisma.mints.updateMany({
      where: {
        uuid: uuid,
      },
      data: {
        status: status,
      },
    });
    logger.info(`Updated status for UUID ${uuid} to ${status}.`);
  } catch (error) {
    logger.error(`Error updating status for UUID ${uuid}: ${error}`);
    throw error;
  }
}
