/*
  Warnings:

  - You are about to drop the column `hasMinted` on the `AllowedAddress` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AllowedAddress" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "quantityAllowed" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "uuid" TEXT
);
INSERT INTO "new_AllowedAddress" ("address", "isLocked", "quantityAllowed", "uuid") SELECT "address", "isLocked", "quantityAllowed", "uuid" FROM "AllowedAddress";
DROP TABLE "AllowedAddress";
ALTER TABLE "new_AllowedAddress" RENAME TO "AllowedAddress";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
