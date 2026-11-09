-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('PHONE', 'EMAIL', 'WHATSAPP', 'LINKEDIN', 'INTERVIEW_DISCUSSION', 'INTERNAL_NOTE', 'OFFER_DISCUSSION', 'FOLLOW_UP');

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "applicationId" TEXT,
    "type" "CommunicationType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "candidateResponse" TEXT,
    "nextAction" TEXT,
    "followUpDate" TIMESTAMP(3),
    "attachmentKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationLog_candidateId_idx" ON "CommunicationLog"("candidateId");

-- CreateIndex
CREATE INDEX "CommunicationLog_followUpDate_idx" ON "CommunicationLog"("followUpDate");

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
