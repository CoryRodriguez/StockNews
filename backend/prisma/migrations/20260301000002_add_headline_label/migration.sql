-- CreateTable
CREATE TABLE "HeadlineLabel" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "overrideCategory" TEXT,
    "overrideTier" INTEGER,
    "notes" TEXT,
    "aiReclassCategory" TEXT,
    "aiReclassTier" INTEGER,
    "aiReclassReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeadlineLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HeadlineLabel_signalId_key" ON "HeadlineLabel"("signalId");

-- CreateIndex
CREATE INDEX "HeadlineLabel_signalId_idx" ON "HeadlineLabel"("signalId");
