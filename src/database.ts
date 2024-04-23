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

// Function to calculate the total minted quantity for tokens where mint has succeeded or is pending
export async function getTotalMintedQuantity(tx: any): Promise<number> {
  try {
    // Aggregate the quantity to calculate the sum within the transaction context
    const result = await tx.mintedTokens.aggregate({
      where: {
        status: {
          in: ["succeeded", "pending"], // Filter tokens with status "succeeded" or "pending"
        },
      },
      _sum: {
        quantity: true,
      },
    });

    // The sum will be null if there are no entries, so default to 0
    return result._sum.quantity || 0;
  } catch (error) {
    console.error("Error retrieving total minted quantity for succeeded or pending mints within transaction:", error);
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
