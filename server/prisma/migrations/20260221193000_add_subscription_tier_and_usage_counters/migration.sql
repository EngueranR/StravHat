-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'SUPPORTER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "UsageFeature" AS ENUM ('STRAVA_IMPORT', 'AI_REQUEST', 'TRAINING_PLAN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE IF NOT EXISTS "UsageCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" "UsageFeature" NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UsageCounter_userId_feature_bucketStart_key"
ON "UsageCounter"("userId", "feature", "bucketStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageCounter_userId_feature_bucketStart_idx"
ON "UsageCounter"("userId", "feature", "bucketStart");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UsageCounter_userId_fkey'
  ) THEN
    ALTER TABLE "UsageCounter"
      ADD CONSTRAINT "UsageCounter_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
