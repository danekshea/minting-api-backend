export async function isAllowlisted(address: string, tx: any): Promise<{ isAllowed: boolean; reason?: string }> {
  const allowedAddress = await tx.allowedAddress.findUnique({
    where: { address },
  });

  if (!allowedAddress) {
    // Address is not on the list at all
    return { isAllowed: false, reason: "Address is not on the allowlist." };
  } else if (allowedAddress.hasMinted) {
    // Address has already minted
    return { isAllowed: false, reason: "Address has already minted." };
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

export async function markUUIDMinted(uuid: string, tx: any): Promise<void> {
  await tx.allowedAddress.updateMany({
    where: {
      uuid: uuid,
    },
    data: {
      hasMinted: true,
    },
  });
}

export async function lockUUID(uuid: string, tx: any): Promise<void> {
  await tx.allowedAddress.updateMany({
    where: {
      uuid: uuid, // locks all records with this UUID
    },
    data: {
      isLocked: true,
    },
  });
  console.log(`Locked all addresses with UUID: ${uuid}`);
}

export async function unlockUUID(uuid: string, tx: any): Promise<void> {
  await tx.allowedAddress.updateMany({
    where: {
      uuid: uuid,
    },
    data: {
      isLocked: false,
    },
  });
}
