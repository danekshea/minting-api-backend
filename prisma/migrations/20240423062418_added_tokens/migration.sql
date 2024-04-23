-- CreateTable
CREATE TABLE "MintedTokens" (
    "tokenId" INTEGER NOT NULL,
    "toAddress" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "MintedTokens_tokenId_key" ON "MintedTokens"("tokenId");
