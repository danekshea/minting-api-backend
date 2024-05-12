import { PrismaClient } from "@prisma/client";
import { readAddressesFromFile } from "../utils";
import { loadAddressesIntoAllowlist } from "../database";

const prisma = new PrismaClient();

(async () => {
  const filePath = "data/addresses.txt"; // Path to the file containing Ethereum addresses
  const addresses = await readAddressesFromFile(filePath);
  if (addresses.length > 0) {
    await loadAddressesIntoAllowlist(addresses, 1, prisma);
  } else {
    console.log("No addresses to load.");
  }
  // try {
  //   const addresses = await readAddressesFromAllowlist(0);
  //   addresses.forEach((address) => console.log(address));
  // } catch (error) {
  //   console.error("Error reading addresses from the database:", error);
  // }
})();
