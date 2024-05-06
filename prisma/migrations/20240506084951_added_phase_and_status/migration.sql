/*
  Warnings:

  - Added the required column `phase` to the `Mints` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `Mints` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Mints" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "uuid" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "status" TEXT NOT NULL
);
INSERT INTO "new_Mints" ("address", "uuid") SELECT "address", "uuid" FROM "Mints";
DROP TABLE "Mints";
ALTER TABLE "new_Mints" RENAME TO "Mints";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
