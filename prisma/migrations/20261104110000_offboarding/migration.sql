CREATE TABLE "Offboarding" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "lastWorkingDate" TIMESTAMP(3) NOT NULL,
    "knowledgeTransferCompleted" BOOLEAN NOT NULL DEFAULT false,
    "managerApprovalReceived" BOOLEAN NOT NULL DEFAULT false,
    "assetsIssued" BOOLEAN NOT NULL DEFAULT false,
    "assetsReturned" BOOLEAN NOT NULL DEFAULT false,
    "settlementStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Offboarding_offerId_key" ON "Offboarding"("offerId");

ALTER TABLE "Offboarding"
ADD CONSTRAINT "Offboarding_offerId_fkey"
FOREIGN KEY ("offerId") REFERENCES "Offer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
