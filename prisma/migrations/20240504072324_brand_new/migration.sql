-- CreateTable
CREATE TABLE "Address" (
    "address" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "Mints" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "uuid" TEXT NOT NULL
);
