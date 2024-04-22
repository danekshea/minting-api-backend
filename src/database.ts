export async function isAllowlisted(address: string, tx: any): Promise<boolean> {
  const allowedAddress = await tx.allowedAddress.findUnique({
    where: { address },
  });
  return allowedAddress ? !allowedAddress.hasMinted && !allowedAddress.isLocked : false;
}

export async function markAddressAsMinted(address: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: { address },
    data: { hasMinted: true },
  });
}

export async function lockAddress(address: string, uuid: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: { address },
    data: { isLocked: true, uuid },
  });
}

export async function unlockAddress(address: string, tx: any): Promise<void> {
  await tx.allowedAddress.update({
    where: { address },
    data: { isLocked: false },
  });
}
