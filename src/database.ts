import { PrismaClient } from "@prisma/client";
import logger from "./logger";

const prisma = new PrismaClient();

export async function isAllowlisted(address: string, tx: any): Promise<{ isAllowed: boolean; reason?: string }> {
  const allowedAddress = await tx.allowedAddress.findUnique({ where: { address } });

  if (!allowedAddress) {
    logger.info(`Address ${address} is not on the allowlist.`);
    return { isAllowed: false, reason: "Address is not on the allowlist." };
  } else if (allowedAddress.quantityAllowed === 0) {
    logger.info(`Address ${address} has no allowance left.`);
    return { isAllowed: false, reason: "Address has no allowance left." };
  } else if (allowedAddress.isLocked) {
    logger.info(`Address ${address} is currently locked.`);
    return { isAllowed: false, reason: "Address is currently locked." };
  }

  logger.debug(`Address ${address} is allowlisted and ready to mint.`);
  return { isAllowed: true };
}

export async function setUUID(address: string, uuid: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: { address },
    data: { uuid },
  });
  logger.debug(`Set UUID ${uuid} for address ${address}.`);
}

export async function decreaseQuantityAllowed(address: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: { address },
    data: { quantityAllowed: { decrement: 1 } },
  });
  logger.info(`Decreased quantity allowed for address ${address}.`);
}

export async function lockAddress(address: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: { address },
    data: { isLocked: true },
  });
  logger.info(`Locked address ${address}.`);
}

export async function unlockAddress(address: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: { address },
    data: { isLocked: false },
  });
  logger.info(`Unlocked address ${address}.`);
}

export async function addTokenMinted(tokenID: number, collectionAddress: string, toAddress: string, uuid: string, status: string, tx: any): Promise<void> {
  await tx.mintedTokens.create({
    data: { tokenID, collectionAddress, toAddress, uuid, status },
  });
  logger.info(`Added minted token with ID ${tokenID} for address ${toAddress}.`);
}

export async function getTotalMintedQuantity(): Promise<number> {
  try {
    const result = await prisma.mintedTokens.aggregate({
      where: {
        status: { in: ["succeeded", "pending"] },
      },
      _count: { tokenID: true },
    });
    const totalMintedQuantity = result._count.tokenID || 0;
    logger.debug(`Total minted quantity: ${totalMintedQuantity}.`);
    return totalMintedQuantity;
  } catch (error) {
    logger.error("Error retrieving total minted quantity for succeeded or pending mints:", error);
    return 0;
  }
}

export async function getMaxTokenID(): Promise<number> {
  try {
    const result = await prisma.mintedTokens.aggregate({
      _max: { tokenID: true },
    });
    const maxTokenID = result._max.tokenID || 0;
    logger.debug(`Max token ID: ${maxTokenID}.`);
    return maxTokenID;
  } catch (error) {
    logger.error("Error retrieving max token ID:", error);
    return 0;
  }
}

export async function updateUUIDStatus(uuid: string, status: string, tx: any): Promise<void> {
  await tx.mintedTokens.updateMany({
    where: { uuid },
    data: { status },
  });
  logger.info(`Updated status of minted tokens with UUID ${uuid} to ${status}.`);
}
