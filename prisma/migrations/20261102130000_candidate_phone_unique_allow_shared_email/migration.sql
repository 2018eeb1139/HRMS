-- Refuse the migration if existing phone numbers collide after normalization.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Candidate"
        WHERE "phone" IS NOT NULL
          AND regexp_replace("phone", '[^0-9]', '', 'g') <> ''
        GROUP BY regexp_replace("phone", '[^0-9]', '', 'g')
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot enforce unique candidate phone numbers: duplicate normalized phone numbers exist';
    END IF;
END $$;

ALTER TABLE "Candidate" ADD COLUMN "phoneNormalized" TEXT;

UPDATE "Candidate"
SET "phoneNormalized" = NULLIF(regexp_replace("phone", '[^0-9]', '', 'g'), '')
WHERE "phone" IS NOT NULL;

DROP INDEX "Candidate_email_key";

CREATE UNIQUE INDEX "Candidate_phoneNormalized_key"
ON "Candidate"("phoneNormalized");
