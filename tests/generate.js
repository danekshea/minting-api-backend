const { ethers } = require("ethers");
const fs = require("fs");

async function generateAndSign(message) {
  const signers = [];

  for (let i = 0; i < 3000; i++) {
    // Create a new wallet
    const wallet = ethers.Wallet.createRandom();

    // Sign the message
    const signature = await wallet.signMessage(message);

    // Store the address, private key, and signature
    signers.push({
      address: wallet.address,
      privateKey: wallet.privateKey,
      signature: signature,
    });
  }

  return signers;
}

generateAndSign("Sign this message to verify your wallet address").then((signers) => {
  const outputFilePath = "tests/signers.json";

  const dataToWrite = JSON.stringify(signers, null, 2);

  fs.writeFile(outputFilePath, dataToWrite, (err) => {
    if (err) {
      console.error("Error writing file:", err);
      return;
    }
    console.log("EOAs and Signatures saved to:", outputFilePath);
  });
});
