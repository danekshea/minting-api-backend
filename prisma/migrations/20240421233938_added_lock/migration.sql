-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AllowedAddress" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "hasMinted" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_AllowedAddress" ("address", "hasMinted", "quantity") SELECT "address", "hasMinted", "quantity" FROM "AllowedAddress";
DROP TABLE "AllowedAddress";
ALTER TABLE "new_AllowedAddress" RENAME TO "AllowedAddress";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
