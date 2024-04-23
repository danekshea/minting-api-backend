/*
  Warnings:

  - You are about to drop the column `quantity` on the `MintedTokens` table. All the data in the column will be lost.
  - Added the required column `contractAddress` to the `MintedTokens` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `MintedTokens` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uuid` to the `MintedTokens` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MintedTokens" (
    "tokenId" INTEGER NOT NULL,
    "toAddress" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_MintedTokens" ("createdAt", "toAddress", "tokenId") SELECT "createdAt", "toAddress", "tokenId" FROM "MintedTokens";
DROP TABLE "MintedTokens";
ALTER TABLE "new_MintedTokens" RENAME TO "MintedTokens";
CREATE UNIQUE INDEX "MintedTokens_tokenId_key" ON "MintedTokens"("tokenId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
