import { blockchainData, config as sdkConfig } from "@imtbl/sdk";
import { v4 as uuidv4 } from "uuid";
import serverConfig from "./config";
import { environment } from "./config";
import logger from "./logger";
import { addTokenMinted, getPhaseMaxTokenID, getPhaseTotalMintedQuantity, getTokensMintedByWallet, getTotalMintedQuantity, hasAllowance, isAddressLocked, isOnAllowlist, lockAddress, setUUID } from "./database";
import { getMetadataByTokenId } from "./utils";

export const mintByMintingAPI = async (contractAddress: string, walletAddress: string, metadata: NFTMetadata | null, tokenID?: string): Promise<string> => {
  const config: blockchainData.BlockchainDataModuleConfiguration = {
    baseConfig: new sdkConfig.ImmutableConfiguration({
      environment: environment,
    }),
    overrides: {
      basePath: serverConfig[environment].API_URL,
      headers: {
        "x-immutable-api-key": serverConfig[environment].API_KEY!,
      },
    },
  };

  const client = new blockchainData.BlockchainData(config);
  const uuid = uuidv4();

  const asset: any = {
    owner_address: walletAddress,
    reference_id: uuid,
    token_id: tokenID || null,
  };

  if (metadata !== null) {
    asset.metadata = metadata;
  }

  try {
    const response = await client.createMintRequest({
      chainName: serverConfig[environment].chainName,
      contractAddress,
      createMintRequestRequest: {
        assets: [asset],
      },
    });

    logger.info(`Mint request sent with UUID: ${uuid}`);
    logger.debug("Mint request response:", JSON.stringify(response, null, 2));
    console.log(response);

    return uuid;
  } catch (error) {
    logger.error("Error sending mint request:", JSON.stringify(error, null, 2));
    throw error;
  }
};

export async function performMint(walletAddress: string, currentPhase, currentPhaseIndex, tx) {
  // Check if the wallet address is locked
  const isLocked = await isAddressLocked(walletAddress, tx);
  if (isLocked) {
    logger.info(`Wallet address ${walletAddress} is locked.`);
    throw new Error("Wallet address is locked.");
  }

  // Check the minted supply against the maximum limit for the current phase
  const phaseMintedSupply = await getPhaseTotalMintedQuantity(currentPhaseIndex, tx);
  if (phaseMintedSupply >= currentPhase.endTokenID - currentPhase.startTokenID + 1) {
    logger.info(`Maximum supply for the current phase (${currentPhase.name}) has been minted.`);
    throw new Error(`Maximum supply for the current phase (${currentPhase.name}) has been minted.`);
  }

  // Check the total minted supply against the maximum limit across all phases
  const totalSupplyMinted = await getTotalMintedQuantity(tx);
  if (totalSupplyMinted >= serverConfig[environment].maxTokenSupplyAcrossAllPhases) {
    logger.info(`Maximum supply across all phases has been minted.`);
    throw new Error("Maximum supply across all phases has been minted.");
  }

  // Get the current token ID counter for the phase
  const maxTokenID = await getPhaseMaxTokenID(currentPhaseIndex, tx);
  let tokenIDcounter;
  if (maxTokenID === 0) {
    tokenIDcounter = currentPhase.startTokenID;
  } else {
    tokenIDcounter = maxTokenID + 1;
  }
  logger.debug(`Current token ID counter for the phase: ${tokenIDcounter}`);

  //Check if the allowlist is enabled
  if (currentPhase.enableAllowList) {
    // First check if the address is on the allowlist
    const isAllowlisted = await isOnAllowlist(walletAddress, currentPhaseIndex, tx);
    if (!isAllowlisted) {
      const errorReason = "Address is not on the allowlist.";
      logger.info(`Wallet address ${walletAddress} not allowed to mint in the current phase (${currentPhase.name}): ${errorReason}`);
      throw new Error(`Wallet address ${walletAddress} not allowed to mint in the current phase (${currentPhase.name}): ${errorReason}`);
    }

    // Then check if the address has any allowance left
    const hasMintAllowance = await hasAllowance(walletAddress, currentPhaseIndex, tx);
    if (!hasMintAllowance) {
      const errorReason = "Address has no token allowance left.";
      logger.info(`Wallet address ${walletAddress} not allowed to mint in the current phase (${currentPhase.name}): ${errorReason}`);
      throw new Error(`Wallet address ${walletAddress} not allowed to mint in the current phase (${currentPhase.name}): ${errorReason}`);
      return;
    }
  }

  // Check if the wallet has reached its minting limit per wallet for the phase
  if (currentPhase.maxTokensPerWallet) {
    const mintedByWallet = await getTokensMintedByWallet(walletAddress, tx);
    if (mintedByWallet >= currentPhase.maxTokensPerWallet) {
      logger.info(`Wallet address ${walletAddress} has reached the maximum mints per wallet (${currentPhase.maxTokensPerWallet}) for the current phase (${currentPhase.name}).`);
      throw new Error(`Wallet address ${walletAddress} has reached the maximum mints per wallet (${currentPhase.maxTokensPerWallet}) for the current phase (${currentPhase.name}).`);
    }
  }

  // Retrieve metadata for the token and initiate the minting process
  const metadata = await getMetadataByTokenId(serverConfig[environment].metadataDir, tokenIDcounter.toString());
  logger.info(`Initiating mint request for wallet address ${walletAddress}`);
  const uuid = await mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress, metadata, tokenIDcounter.toString());

  // Set UUID for the wallet address, lock the address, and record the minted token
  logger.debug(`Locking wallet address ${walletAddress}`);
  await lockAddress(walletAddress, tx);
  if (currentPhase.enableAllowList) {
    setUUID(walletAddress, uuid, tx);
  }
  await addTokenMinted(tokenIDcounter, serverConfig[environment].collectionAddress, walletAddress, currentPhaseIndex, uuid, "pending", tx);

  // Send response with wallet address and UUID of the mint
  const response = { tokenID: tokenIDcounter, collectionAddress: serverConfig[environment].collectionAddress, walletAddress, uuid };

  return response;
}
