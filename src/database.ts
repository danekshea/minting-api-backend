import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function isAllowlisted(address: string, tx: any): Promise<{ isAllowed: boolean; reason?: string }> {
  const allowedAddress = await tx.allowedAddress.findUnique({
    where: { address },
  });

  if (!allowedAddress) {
    // Address is not on the list at all
    return { isAllowed: false, reason: "Address is not on the allowlist." };
  } else if (allowedAddress.quantityAllowed === 0) {
    // Address has already minted
    return { isAllowed: false, reason: "Address has no allowance left." };
  } else if (allowedAddress.isLocked) {
    // Address is currently locked
    return { isAllowed: false, reason: "Address is currently locked." };
  }

  // Address is allowlisted and ready to mint
  return { isAllowed: true };
}

export async function setUUID(address: string, uuid: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: {
      address,
    },
    data: {
      uuid,
    },
  });
}

export async function decreaseQuantityAllowed(address: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: {
      address: address,
    },
    data: {
      quantityAllowed: {
        decrement: 1,
      },
    },
  });
}

export async function lockAddress(address: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: {
      address: address, // locks all records with this UUID
    },
    data: {
      isLocked: true,
    },
  });
  console.log(`Locked address: ${address}`);
}

export async function unlockAddress(address: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: {
      address: address,
    },
    data: {
      isLocked: false,
    },
  });
}

export async function addTokenMinted(tokenID: number, collectionAddress: string, toAddress: string, uuid: string, status: string, tx: any): Promise<void> {
  await tx.mintedTokens.create({
    data: {
      tokenID,
      collectionAddress,
      toAddress,
      uuid,
      status,
    },
  });
}

export async function getTotalMintedQuantity(): Promise<number> {
  try {
    // Aggregate the quantity to calculate the sum
    const result = await prisma.mintedTokens.aggregate({
      where: {
        status: {
          in: ["succeeded", "pending"], // Filter tokens with status "succeeded" or "pending"
        },
      },
      _count: {
        tokenID: true,
      },
    });

    // The sum will be null if there are no entries, so default to 0
    return result._count.tokenID || 0;
  } catch (error) {
    console.error("Error retrieving total minted quantity for succeeded or pending mints:", error);
    return 0;
  }
}

export async function getMaxTokenID(): Promise<number> {
  try {
    const result = await prisma.mintedTokens.aggregate({
      _max: {
        tokenID: true,
      },
    });

    return result._max.tokenID || 0;
  } catch (error) {
    console.error("Error retrieving max token ID:", error);
    return 0;
  }
}

export async function updateUUIDStatus(uuid: string, status: string, tx: any): Promise<void> {
  await tx.mintedTokens.updateMany({
    where: {
      uuid,
    },
    data: {
      status,
    },
  });
}
