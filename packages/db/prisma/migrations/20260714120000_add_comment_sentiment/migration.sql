DO $$ BEGIN
  CREATE TYPE "CommentSentiment" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "BusinessComment"
  ADD COLUMN IF NOT EXISTS "sentiment" "CommentSentiment" NOT NULL DEFAULT 'NEUTRAL';
