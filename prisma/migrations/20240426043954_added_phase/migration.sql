/*
  Warnings:

  - Added the required column `phase` to the `MintedTokens` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AllowedAddress" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "quantityAllowed" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "phase" INTEGER NOT NULL,
    "uuid" TEXT
);
INSERT INTO "new_AllowedAddress" ("address", "isLocked", "phase", "quantityAllowed", "uuid") SELECT "address", "isLocked", "phase", "quantityAllowed", "uuid" FROM "AllowedAddress";
DROP TABLE "AllowedAddress";
ALTER TABLE "new_AllowedAddress" RENAME TO "AllowedAddress";
CREATE TABLE "new_MintedTokens" (
    "tokenID" INTEGER NOT NULL,
    "toAddress" TEXT NOT NULL,
    "collectionAddress" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "uuid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_MintedTokens" ("collectionAddress", "createdAt", "status", "toAddress", "tokenID", "uuid") SELECT "collectionAddress", "createdAt", "status", "toAddress", "tokenID", "uuid" FROM "MintedTokens";
DROP TABLE "MintedTokens";
ALTER TABLE "new_MintedTokens" RENAME TO "MintedTokens";
CREATE UNIQUE INDEX "MintedTokens_tokenID_key" ON "MintedTokens"("tokenID");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
