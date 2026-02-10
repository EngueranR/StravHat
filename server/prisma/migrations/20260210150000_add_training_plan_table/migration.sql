-- CreateTable
CREATE TABLE IF NOT EXISTS "TrainingPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "weeks" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "raceDate" TIMESTAMP(3) NOT NULL,
    "daysToRace" INTEGER NOT NULL,
    "overview" TEXT NOT NULL,
    "methodology" TEXT NOT NULL,
    "warnings" JSONB NOT NULL,
    "plan" JSONB NOT NULL,
    "sourceModel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrainingPlan_userId_updatedAt_idx" ON "TrainingPlan"("userId", "updatedAt" DESC);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TrainingPlan_userId_fkey'
  ) THEN
    ALTER TABLE "TrainingPlan"
      ADD CONSTRAINT "TrainingPlan_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
