-- CreateTable
CREATE TABLE IF NOT EXISTS "ChartSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chartType" TEXT NOT NULL,
    "filterHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ChartSnapshot_userId_chartType_filterHash_key" ON "ChartSnapshot"("userId", "chartType", "filterHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChartSnapshot_userId_chartType_updatedAt_idx" ON "ChartSnapshot"("userId", "chartType", "updatedAt" DESC);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ChartSnapshot_userId_fkey'
  ) THEN
    ALTER TABLE "ChartSnapshot"
      ADD CONSTRAINT "ChartSnapshot_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
