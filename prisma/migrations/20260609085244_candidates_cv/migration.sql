-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('HR_UPLOAD', 'REFERRAL', 'LINKEDIN', 'JOB_PORTAL', 'AGENCY', 'DIRECT', 'TALENT_POOL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CvStatus" AS ENUM ('UPLOADED', 'PARSING', 'PARSED', 'FAILED');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "currentCompany" TEXT,
    "currentRole" TEXT,
    "yearsExperience" INTEGER,
    "skills" TEXT[],
    "education" TEXT,
    "certifications" TEXT[],
    "noticePeriod" TEXT,
    "expectedSalary" TEXT,
    "currentSalary" TEXT,
    "linkedinUrl" TEXT,
    "portfolioUrl" TEXT,
    "source" "CandidateSource" NOT NULL DEFAULT 'HR_UPLOAD',
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvFile" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "parsedText" TEXT,
    "parsedJson" JSONB,
    "status" "CvStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_email_key" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Candidate_email_idx" ON "Candidate"("email");

-- AddForeignKey
ALTER TABLE "CvFile" ADD CONSTRAINT "CvFile_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
