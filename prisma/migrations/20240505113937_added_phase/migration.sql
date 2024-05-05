-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Allowlist" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "phase" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Allowlist" ("address") SELECT "address" FROM "Allowlist";
DROP TABLE "Allowlist";
ALTER TABLE "new_Allowlist" RENAME TO "Allowlist";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
