-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Allowlist" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "phase" INTEGER NOT NULL
);
INSERT INTO "new_Allowlist" ("address", "phase") SELECT "address", "phase" FROM "Allowlist";
DROP TABLE "Allowlist";
ALTER TABLE "new_Allowlist" RENAME TO "Allowlist";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
