import { blockchainData, config as sdkConfig } from "@imtbl/sdk";
import { v4 as uuidv4 } from "uuid";
import serverConfig from "./config";
import { environment } from "./config";
import logger from "./logger";
import { addTokenMinted, calculateMaxPhaseSupply, getPhaseMaxTokenID, getPhaseTotalMintedQuantity, getTokensMintedByWallet, getTotalMintedQuantity, hasAllowance, isAddressLocked, isOnAllowlist, lockAddress, setUUID } from "./database";
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

  // Check the minted supply against the maximum limit for the current phase using adjusted supply calculation
  const maxPhaseSupply = await calculateMaxPhaseSupply(currentPhase, currentPhaseIndex, tx);
  const phaseMintedSupply = await getPhaseTotalMintedQuantity(currentPhaseIndex, tx);
  if (phaseMintedSupply >= maxPhaseSupply) {
    logger.info(`Maximum supply for the current phase (${currentPhase.name}) has been minted.`);
    throw new Error(`Maximum supply for the current phase (${currentPhase.name}) has been minted.`);
  }

  // Check the total minted supply against the maximum limit across all phases
  const totalSupplyMinted = await getTotalMintedQuantity(tx);
  if (totalSupplyMinted >= serverConfig[environment].maxTokenSupplyAcrossAllPhases) {
    logger.info(`Maximum supply across all phases has been minted.`);
    throw new Error("Maximum supply across all phases has been minted.");
  }

  // Determine the token ID counter for the current phase
  const maxTokenID = await getPhaseMaxTokenID(currentPhaseIndex, tx);
  let tokenIDcounter;
  if (maxTokenID === 0) {
    if (currentPhase.enableTokenIDRollOver && currentPhaseIndex > 0) {
      const previousPhaseMaxTokenID = await getPhaseMaxTokenID(currentPhaseIndex - 1, tx);
      tokenIDcounter = previousPhaseMaxTokenID + 1;
    } else {
      // As per configuration validation, startTokenID should always be defined when not using enableTokenIDRollOver
      tokenIDcounter = currentPhase.startTokenID;
    }
  } else {
    tokenIDcounter = maxTokenID + 1;
  }
  logger.debug(`Current token ID counter for the phase: ${tokenIDcounter}`);

  // Perform allowance and list checks if applicable
  if (currentPhase.enableAllowList) {
    const isAllowlisted = await isOnAllowlist(walletAddress, currentPhaseIndex, tx);
    if (!isAllowlisted) {
      logger.info(`Wallet address ${walletAddress} not allowed to mint in the current phase (${currentPhase.name}): Address is not on the allowlist.`);
      throw new Error(`Wallet address ${walletAddress} not allowed to mint in the current phase (${currentPhase.name}): Address is not on the allowlist.`);
    }

    const hasMintAllowance = await hasAllowance(walletAddress, currentPhaseIndex, tx);
    if (!hasMintAllowance) {
      logger.info(`Wallet address ${walletAddress} has no token allowance left.`);
      throw new Error(`Wallet address ${walletAddress} not allowed to mint in the current phase (${currentPhase.name}): No token allowance left.`);
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
  const uuid = await mintByMintingAPI(serverConfig[environment].collectionAddress, walletAddress, metadata, tokenIDcounter.toString());

  // Lock the address and record the minted token
  await lockAddress(walletAddress, tx);
  if (currentPhase.enableAllowList) {
    await setUUID(walletAddress, uuid, tx);
  }
  await addTokenMinted(tokenIDcounter, serverConfig[environment].collectionAddress, walletAddress, currentPhaseIndex, uuid, "pending", tx);

  // Send response with wallet address and UUID of the mint
  return { tokenID: tokenIDcounter, collectionAddress: serverConfig[environment].collectionAddress, walletAddress, uuid };
}
