-- CreateTable
CREATE TABLE "LockedAddress" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "isLocked" BOOLEAN NOT NULL DEFAULT true,
    "lockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
