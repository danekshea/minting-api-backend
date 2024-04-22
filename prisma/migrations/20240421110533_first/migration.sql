-- CreateTable
CREATE TABLE "AllowedAddress" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "hasMinted" BOOLEAN NOT NULL DEFAULT false
);
