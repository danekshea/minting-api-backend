/*
  Warnings:

  - You are about to drop the column `tokenId` on the `MintedTokens` table. All the data in the column will be lost.
  - Added the required column `tokenID` to the `MintedTokens` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MintedTokens" (
    "tokenID" INTEGER NOT NULL,
    "toAddress" TEXT NOT NULL,
    "collectionAddress" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_MintedTokens" ("collectionAddress", "createdAt", "status", "toAddress", "uuid") SELECT "collectionAddress", "createdAt", "status", "toAddress", "uuid" FROM "MintedTokens";
DROP TABLE "MintedTokens";
ALTER TABLE "new_MintedTokens" RENAME TO "MintedTokens";
CREATE UNIQUE INDEX "MintedTokens_tokenID_key" ON "MintedTokens"("tokenID");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
