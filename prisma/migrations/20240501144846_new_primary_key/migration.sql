/*
  Warnings:

  - The primary key for the `AllowedAddress` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AllowedAddress" (
    "address" TEXT NOT NULL,
    "quantityAllowed" INTEGER NOT NULL DEFAULT 0,
    "phase" INTEGER NOT NULL,
    "uuid" TEXT,

    PRIMARY KEY ("address", "phase")
);
INSERT INTO "new_AllowedAddress" ("address", "phase", "quantityAllowed", "uuid") SELECT "address", "phase", "quantityAllowed", "uuid" FROM "AllowedAddress";
DROP TABLE "AllowedAddress";
ALTER TABLE "new_AllowedAddress" RENAME TO "AllowedAddress";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
