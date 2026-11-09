-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('TO_BE_PREPARED', 'SENT', 'UNDER_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'JOINED');

-- CreateEnum
CREATE TYPE "JoiningRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "offeredSalary" TEXT,
    "offerDate" TIMESTAMP(3),
    "status" "OfferStatus" NOT NULL DEFAULT 'TO_BE_PREPARED',
    "expectedJoiningDate" TIMESTAMP(3),
    "confirmedJoiningDate" TIMESTAMP(3),
    "noticePeriod" TEXT,
    "documentsPending" TEXT[],
    "joiningRisk" "JoiningRisk",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_applicationId_key" ON "Offer"("applicationId");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- CreateIndex
CREATE INDEX "Offer_confirmedJoiningDate_idx" ON "Offer"("confirmedJoiningDate");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
