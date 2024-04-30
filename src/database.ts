import { PrismaClient, Prisma } from "@prisma/client";
import logger from "./logger";
import serverConfig from "./config";
import { environment } from "./config";
import axios from "axios";

const prisma = new PrismaClient();

async function executeWithLogging(operation, description) {
  try {
    const result = await operation();
    logger.debug(`${description}: Success`);
    return result;
  } catch (error) {
    logger.error(`${description}: Failed`, { error });
    throw new Error(`Error during ${description.toLowerCase()}: ${error.message}`);
  }
}

export function isOnAllowlist(address, phase, tx) {
  return executeWithLogging(() => tx.allowedAddress.findUnique({ where: { address, phase } }), `Checking if address ${address} is on allowlist for phase ${phase}`).then((result) => Boolean(result));
}

export function hasAllowance(address, phase, tx) {
  return executeWithLogging(() => tx.allowedAddress.findUnique({ where: { address, phase } }), `Checking allowance for address ${address} in phase ${phase}`).then((result) => (result ? result.quantityAllowed > 0 : false));
}

export function decreaseQuantityAllowed(address, tx) {
  return executeWithLogging(
    () =>
      tx.allowedAddress.update({
        where: { address },
        data: { quantityAllowed: { decrement: 1 } },
      }),
    `Decreasing quantity allowed for address ${address}`
  );
}

export function lockAddress(address, tx) {
  return executeWithLogging(() => tx.lockedAddress.create({ data: { address } }), `Locking address ${address}`);
}

export function unlockAddress(address, tx) {
  return executeWithLogging(() => tx.lockedAddress.delete({ where: { address } }), `Unlocking address ${address}`);
}

export function isAddressLocked(address, tx) {
  return executeWithLogging(() => tx.lockedAddress.findUnique({ where: { address } }), `Checking if address ${address} is locked`).then((result) => result !== null);
}

export function addTokenMinted(tokenID, collectionAddress, walletAddress, phase, uuid, status, tx) {
  return executeWithLogging(
    () =>
      tx.mintedTokens.create({
        data: { tokenID, collectionAddress, walletAddress, phase, uuid, status },
      }),
    `Adding minted token ID ${tokenID} for wallet ${walletAddress}`
  );
}

export function setUUID(walletAddress, uuid, tx) {
  return executeWithLogging(
    () =>
      tx.allowedAddress.update({
        where: { address: walletAddress },
        data: { uuid },
      }),
    `Setting UUID for wallet address ${walletAddress}`
  );
}

export function isUUIDAllowList(uuid, tx) {
  return executeWithLogging(() => tx.allowedAddress.findMany({ where: { uuid } }), `Checking if UUID ${uuid} is on allowlist`).then((result) => Boolean(result.length));
}

export function getPhaseTotalMintedQuantity(phase, tx) {
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

export function getTotalMintedQuantity(tx) {
  return executeWithLogging(
    () =>
      tx.mintedTokens.aggregate({
        where: { status: { in: ["succeeded", "pending"] } },
        _count: { tokenID: true },
      }),
    "Getting total minted quantity"
  ).then((result) => result._count.tokenID || 0);
}

export function getPhaseMaxTokenID(phase, tx) {
  return executeWithLogging(
    () =>
      tx.mintedTokens.aggregate({
        _max: { tokenID: true },
        where: { phase },
      }),
    `Getting maximum token ID for phase ${phase}`
  ).then((result) => result._max.tokenID || 0);
}

export function updateUUIDStatus(uuid, status, tx) {
  return executeWithLogging(
    () =>
      tx.mintedTokens.updateMany({
        where: { uuid },
        data: { status },
      }),
    `Updating status of tokens with UUID ${uuid} to ${status}`
  );
}

export function getTokensMintedByWallet(walletAddress, tx) {
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

export function queryAndCorrectPendingMints() {
  return executeWithLogging(async () => {
    const pendingMints = await prisma.mintedTokens.findMany({
      where: { status: "pending" },
    });
    if (pendingMints.length > 0) {
      await Promise.all(
        pendingMints.map(async (mint) => {
          const response = await axios.get(serverConfig[environment].mintRequestURL(serverConfig[environment].chainName, serverConfig[environment].collectionAddress, mint.uuid), {
            headers: { "x-immutable-api-key": serverConfig[environment].API_KEY },
          });
          if (response.data.result[0].status === "succeeded") {
            await prisma.mintedTokens.updateMany({
              where: { uuid: mint.uuid },
              data: { status: "succeeded" },
            });
          } else if (response.data.result[0].status === "failed") {
            await prisma.mintedTokens.updateMany({
              where: { uuid: mint.uuid },
              data: { status: "failed" },
            });
          }
        })
      );
    }
    return `Processed ${pendingMints.length} pending mints`;
  }, "Querying and correcting pending mints");
}

export function getTokenQuantityAllowed(address, tx) {
  return executeWithLogging(() => tx.allowedAddress.findUnique({ where: { address } }), `Getting token quantity allowed for address ${address}`).then((result) => result?.quantityAllowed || 0);
}
