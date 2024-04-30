import { PrismaClient, Prisma } from "@prisma/client";
import serverConfig from "./config";
import { environment } from "./config";
import axios from "axios";
import { executeWithLogging } from "./utils";

const prisma = new PrismaClient();

export function isOnAllowlist(address: string, phase: number, tx: Prisma.TransactionClient): Promise<boolean> {
  return executeWithLogging(() => tx.allowedAddress.findUnique({ where: { address, phase } }), `Checking if address ${address} is on allowlist for phase ${phase}`).then((result) => Boolean(result));
}

export function hasAllowance(address: string, phase: number, tx: Prisma.TransactionClient): Promise<boolean> {
  return executeWithLogging(() => tx.allowedAddress.findUnique({ where: { address, phase } }), `Checking allowance for address ${address} in phase ${phase}`).then((result) => (result ? result.quantityAllowed > 0 : false));
}

export function decreaseQuantityAllowed(address: string, tx: Prisma.TransactionClient): Promise<void> {
  return executeWithLogging(
    () =>
      tx.allowedAddress
        .update({
          where: { address },
          data: { quantityAllowed: { decrement: 1 } },
        })
        .then(() => {}),
    `Decreasing quantity allowed for address ${address}`
  );
}

export function lockAddress(address: string, tx: Prisma.TransactionClient): Promise<void> {
  return executeWithLogging(() => tx.lockedAddress.create({ data: { address } }).then(() => {}), `Locking address ${address}`);
}

export function unlockAddress(address: string, tx: Prisma.TransactionClient): Promise<void> {
  return executeWithLogging(() => tx.lockedAddress.delete({ where: { address } }).then(() => {}), `Unlocking address ${address}`);
}

export function isAddressLocked(address: string, tx: Prisma.TransactionClient): Promise<boolean> {
  return executeWithLogging(() => tx.lockedAddress.findUnique({ where: { address } }), `Checking if address ${address} is locked`).then((result) => result !== null);
}

export function addTokenMinted(tokenID: number, collectionAddress: string, walletAddress: string, phase: number, uuid: string, status: string, tx: Prisma.TransactionClient): Promise<void> {
  return executeWithLogging(
    () =>
      tx.mintedTokens
        .create({
          data: { tokenID, collectionAddress, walletAddress, phase, uuid, status },
        })
        .then(() => {}),
    `Adding minted token ID ${tokenID} for wallet ${walletAddress}`
  );
}

export function setUUID(walletAddress: string, uuid: string, tx: Prisma.TransactionClient): Promise<void> {
  return executeWithLogging(
    () =>
      tx.allowedAddress
        .update({
          where: { address: walletAddress },
          data: { uuid },
        })
        .then(() => {}),
    `Setting UUID for wallet address ${walletAddress}`
  );
}

export function isUUIDAllowList(uuid: string, tx: Prisma.TransactionClient): Promise<boolean> {
  return executeWithLogging(() => tx.allowedAddress.findMany({ where: { uuid } }), `Checking if UUID ${uuid} is on allowlist`).then((result) => Boolean(result.length));
}

export function getPhaseTotalMintedQuantity(phase: number, tx: Prisma.TransactionClient): Promise<number> {
  return executeWithLogging(
    () =>
      tx.mintedTokens.aggregate({
        where: {
          status: { in: ["succeeded", "pending"] },
          phase: { equals: phase },
        },
        _count: { tokenID: true },
      }),
    `Getting total minted quantity for phase ${phase}`
  ).then((result) => result._count.tokenID || 0);
}

export function getTotalMintedQuantity(tx: Prisma.TransactionClient): Promise<number> {
  return executeWithLogging(
    () =>
      tx.mintedTokens.aggregate({
        where: { status: { in: ["succeeded", "pending"] } },
        _count: { tokenID: true },
      }),
    "Getting total minted quantity"
  ).then((result) => result._count.tokenID || 0);
}

export function getPhaseMaxTokenID(phase: number, tx: Prisma.TransactionClient): Promise<number> {
  return executeWithLogging(
    () =>
      tx.mintedTokens.aggregate({
        _max: { tokenID: true },
        where: { phase },
      }),
    `Getting maximum token ID for phase ${phase}`
  ).then((result) => result._max.tokenID || 0);
}

export function updateUUIDStatus(uuid: string, status: string, tx: Prisma.TransactionClient): Promise<void> {
  return executeWithLogging(
    () =>
      tx.mintedTokens
        .updateMany({
          where: { uuid },
          data: { status },
        })
        .then(() => {}),
    `Updating status of tokens with UUID ${uuid} to ${status}`
  );
}

export function getTokensMintedByWallet(walletAddress: string, tx: Prisma.TransactionClient): Promise<number> {
  return executeWithLogging(
    () =>
      tx.mintedTokens.aggregate({
        where: {
          walletAddress: walletAddress,
          status: { in: ["succeeded", "pending"] },
        },
        _count: { tokenID: true },
      }),
    `Getting minted tokens count for wallet ${walletAddress}`
  ).then((result) => result._count.tokenID || 0);
}

export function queryAndCorrectPendingMints(): Promise<void> {
  return executeWithLogging(
    async () => {
      const pendingMints = await prisma.mintedTokens.findMany({
        where: { status: "pending" },
      });
      for (const mint of pendingMints) {
        const uuid = mint.uuid;
        const response = await axios.get(serverConfig[environment].mintRequestURL(serverConfig[environment].chainName, serverConfig[environment].collectionAddress, uuid), {
          headers: { "x-immutable-api-key": serverConfig[environment].API_KEY },
        });
        if (response.data.result[0] && response.data.result[0].status === "succeeded") {
          await prisma.mintedTokens.updateMany({
            where: { uuid },
            data: { status: "succeeded" },
          });
        } else if (response.data.result[0] && response.data.result[0].status === "failed") {
          await prisma.mintedTokens.updateMany({
            where: { uuid },
            data: { status: "failed" },
          });
        }
      }
    },
    "Querying and correcting pending mints" // Second argument for the description of the operation
  );
}

export function getTokenQuantityAllowed(address: string, tx: Prisma.TransactionClient): Promise<number> {
  return executeWithLogging(() => tx.allowedAddress.findUnique({ where: { address } }), `Getting token quantity allowed for address ${address}`).then((result) => result?.quantityAllowed || 0);
}
