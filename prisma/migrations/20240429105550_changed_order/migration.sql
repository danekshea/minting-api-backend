/*
  Warnings:

  - You are about to drop the column `toAddress` on the `MintedTokens` table. All the data in the column will be lost.
  - Added the required column `walletAddress` to the `MintedTokens` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MintedTokens" (
    "tokenID" INTEGER NOT NULL,
    "collectionAddress" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "uuid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_MintedTokens" ("collectionAddress", "createdAt", "phase", "status", "tokenID", "uuid") SELECT "collectionAddress", "createdAt", "phase", "status", "tokenID", "uuid" FROM "MintedTokens";
DROP TABLE "MintedTokens";
ALTER TABLE "new_MintedTokens" RENAME TO "MintedTokens";
CREATE UNIQUE INDEX "MintedTokens_tokenID_key" ON "MintedTokens"("tokenID");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
