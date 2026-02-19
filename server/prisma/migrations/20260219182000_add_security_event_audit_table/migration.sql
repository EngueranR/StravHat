-- CreateTable
CREATE TABLE IF NOT EXISTS "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ipHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SecurityEvent_userId_createdAt_idx"
ON "SecurityEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SecurityEvent_eventType_createdAt_idx"
ON "SecurityEvent"("eventType", "createdAt" DESC);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SecurityEvent_userId_fkey'
  ) THEN
    ALTER TABLE "SecurityEvent"
      ADD CONSTRAINT "SecurityEvent_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES "User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
