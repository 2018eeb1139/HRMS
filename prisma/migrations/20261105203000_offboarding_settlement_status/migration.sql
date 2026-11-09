CREATE TYPE "OffboardingSettlementStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

ALTER TABLE "Offboarding"
ADD COLUMN "settlementStatus" "OffboardingSettlementStatus" NOT NULL DEFAULT 'NOT_STARTED';

UPDATE "Offboarding"
SET "settlementStatus" = 'IN_PROGRESS'
WHERE "settlementStartedAt" IS NOT NULL;
