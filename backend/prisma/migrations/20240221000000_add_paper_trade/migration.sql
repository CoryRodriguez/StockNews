-- CreateTable
CREATE TABLE "PaperTrade" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "buyOrderId" TEXT,
    "buyPrice" DOUBLE PRECISION,
    "buyStatus" TEXT NOT NULL,
    "sellOrderId" TEXT,
    "sellPrice" DOUBLE PRECISION,
    "sellStatus" TEXT NOT NULL,
    "catalyst" TEXT NOT NULL,
    "catalystType" TEXT NOT NULL,
    "scannerId" TEXT,
    "pnl" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperTrade_pkey" PRIMARY KEY ("id")
);
