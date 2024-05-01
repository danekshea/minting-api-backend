import { PrismaClient, Prisma } from "@prisma/client";
import logger from "./logger";
import serverConfig from "./config";
import { environment } from "./config";
import axios from "axios";

const prisma = new PrismaClient();

export async function isOnAllowlist(address: string, phase: number, tx: Prisma.TransactionClient): Promise<boolean> {
  const allowedAddress = await tx.allowedAddress.findUnique({ where: { address, phase } });
  return Boolean(allowedAddress);
}

export async function hasAllowance(address: string, phase: number, tx: Prisma.TransactionClient): Promise<boolean> {
  const allowedAddress = await tx.allowedAddress.findUnique({ where: { address, phase } });
  return allowedAddress ? allowedAddress.quantityAllowed > 0 : false;
}

export async function decreaseQuantityAllowed(address: string, tx: Prisma.TransactionClient): Promise<void> {
  await tx.allowedAddress.update({
    where: { address },
    data: { quantityAllowed: { decrement: 1 } },
  });
  logger.info(`Decreased quantity allowed for address ${address}.`);
}

export async function lockAddress(address: string, tx: Prisma.TransactionClient): Promise<void> {
  await tx.lockedAddress.create({
    data: { address },
  });
  logger.info(`Locked address ${address}.`);
}

export async function unlockAddress(address: string, tx: Prisma.TransactionClient): Promise<void> {
  await tx.lockedAddress.delete({
    where: { address },
  });
  logger.info(`Unlocked address ${address}.`);
}

export async function isAddressLocked(address: string, tx: Prisma.TransactionClient): Promise<boolean> {
  const lockedAddress = await tx.lockedAddress.findUnique({ where: { address } });
  return lockedAddress !== null;
}

export async function addTokenMinted(tokenID: number, collectionAddress: string, walletAddress: string, phase: number, uuid: string, status: string, tx: Prisma.TransactionClient): Promise<void> {
  await tx.mintedTokens.create({
    data: { tokenID, collectionAddress, walletAddress, phase, uuid, status },
  });
  logger.info(`Added minted token with ID ${tokenID} for address ${walletAddress}.`);
}

export async function setUUID(walletAddress: string, uuid: string, tx: Prisma.TransactionClient): Promise<void> {
  await tx.allowedAddress.update({
    where: { address: walletAddress },
    data: { uuid },
  });
  logger.info(`Set UUID for address ${walletAddress}.`);
}

export async function isUUIDAllowList(uuid: string, tx: Prisma.TransactionClient): Promise<boolean> {
  const result = await tx.allowedAddress.findMany({ where: { uuid } });
  return Boolean(result);
}

export async function getPhaseTotalMintedQuantity(phase: number, tx: Prisma.TransactionClient): Promise<number> {
  try {
    const result = await tx.mintedTokens.aggregate({
      where: {
        status: { in: ["succeeded", "pending"] },
        phase: { equals: phase },
      },
      _count: { tokenID: true },
    });
    const totalMintedQuantity = result._count.tokenID || 0;
    logger.debug(`Total minted quantity: ${totalMintedQuantity}.`);
    return totalMintedQuantity;
  } catch (error) {
    logger.error(`Error retrieving total minted quantity for succeeded or pending mints: ${JSON.stringify(error, null, 2)}`);
    return 0;
  }
}

export async function getTotalMintedQuantity(tx: Prisma.TransactionClient): Promise<number> {
  try {
    const result = await tx.mintedTokens.aggregate({
      where: {
        status: { in: ["succeeded", "pending"] },
      },
      _count: { tokenID: true },
    });
    const totalMintedQuantity = result._count.tokenID || 0;
    logger.debug(`Total minted quantity: ${totalMintedQuantity}.`);
    return totalMintedQuantity;
  } catch (error) {
    logger.error(`Error retrieving total minted quantity for succeeded or pending mints: ${JSON.stringify(error, null, 2)}`);
    return 0;
  }
}

export async function getPhaseMaxTokenID(phase: number, tx: Prisma.TransactionClient): Promise<number> {
  try {
    const result = await tx.mintedTokens.aggregate({
      _max: { tokenID: true },
      where: { phase },
    });
    const maxTokenID = result._max.tokenID || 0;
    logger.debug(`Max token ID: ${maxTokenID}.`);
    return maxTokenID;
  } catch (error) {
    logger.error(`Error retrieving max token ID: ${JSON.stringify(error, null, 2)}`);
    return 0;
  }
}

export async function updateUUIDStatus(uuid: string, status: string, tx: Prisma.TransactionClient): Promise<void> {
  await tx.mintedTokens.updateMany({
    where: { uuid },
    data: { status },
  });
  logger.info(`Updated status of minted tokens with UUID ${uuid} to ${status}.`);
}

export async function getTokensMintedByWallet(walletAddress: string, tx: Prisma.TransactionClient): Promise<number> {
  try {
    const result = await tx.mintedTokens.aggregate({
      where: {
        walletAddress: walletAddress,
        status: { in: ["succeeded", "pending"] },
      },
      _count: { tokenID: true },
    });
    const mintedQuantity = result._count.tokenID || 0;
    logger.debug(`Minted quantity for wallet ${walletAddress}: ${mintedQuantity}.`);
    return mintedQuantity;
  } catch (error) {
    logger.error(`Error retrieving minted quantity for wallet ${walletAddress}: ${JSON.stringify(error, null, 2)}`);
    return 0;
  }
}

export async function queryAndCorrectPendingMints(): Promise<void> {
  try {
    const pendingMints = await prisma.mintedTokens.findMany({
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
            await prisma.mintedTokens.updateMany({
              where: { uuid },
              data: { status: "succeeded" },
            });

            // Unlock the wallet address
            await unlockAddress(mint.walletAddress, prisma);

            // Log the successful mint
            logger.info(`Mint with UUID ${uuid} succeeded. Updating status.`);
          });
        } else if (response.data.result[0].status === "failed") {
          await prisma.mintedTokens.updateMany({
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

export async function getTokenQuantityAllowed(address: string, tx: Prisma.TransactionClient): Promise<number> {
  try {
    const result = await tx.allowedAddress.findUnique({ where: { address } });
    const quantityAllowed = result?.quantityAllowed || 0;
    logger.debug(`Quantity allowed for address ${address}: ${quantityAllowed}.`);
    return quantityAllowed;
  } catch (error) {
    logger.error(`Error retrieving quantity allowed for address ${address}: ${JSON.stringify(error, null, 2)}`);
    return 0;
  }
}

// Define the maximum supply limit for the current phase based on configuration
export async function calculateMaxPhaseSupply(currentPhase, currentPhaseIndex, tx) {
  let maxPhaseSupply;
  if (currentPhase.enableTokenIDRollOver) {
    if (currentPhase.maxTokenSupply) {
      maxPhaseSupply = currentPhase.maxTokenSupply;
    } else if (currentPhase.endTokenID) {
      // Use endTokenID to calculate the max supply by subtracting the maxTokenID from the previous phase
      const previousPhaseMaxTokenID = currentPhaseIndex > 0 ? await getPhaseMaxTokenID(currentPhaseIndex - 1, tx) : 0;
      maxPhaseSupply = currentPhase.endTokenID - previousPhaseMaxTokenID;
    } else {
      throw new Error(`Configuration error: Neither maxTokenSupply nor endTokenID are defined for phase "${currentPhase.name}" with enableTokenIDRollOver enabled.`);
    }
  } else {
    // If enableTokenIDRollOver is not true, calculate from startTokenID and endTokenID
    if (currentPhase.startTokenID !== undefined && currentPhase.endTokenID !== undefined) {
      maxPhaseSupply = currentPhase.endTokenID - currentPhase.startTokenID + 1;
    } else {
      throw new Error(`Configuration error: Both startTokenID and endTokenID must be defined for phase "${currentPhase.name}" when enableTokenIDRollOver is not used.`);
    }
  }
  return maxPhaseSupply;
}

// Use this function in your minting check
export async function checkMintingLimit(currentPhase, currentPhaseIndex, tx) {
  const maxPhaseSupply = await calculateMaxPhaseSupply(currentPhase, currentPhaseIndex, tx);

  // Check the minted supply against the maximum limit for the current phase
  const phaseMintedSupply = await getPhaseTotalMintedQuantity(currentPhaseIndex, tx);
  if (phaseMintedSupply >= maxPhaseSupply) {
    logger.info(`Maximum supply for the current phase (${currentPhase.name}) has been minted.`);
    throw new Error(`Maximum supply for the current phase (${currentPhase.name}) has been minted.`);
  }
}
