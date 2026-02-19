ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "stravaClientIdEnc" TEXT,
ADD COLUMN "stravaClientSecretEnc" TEXT,
ADD COLUMN "stravaRedirectUriEnc" TEXT;

ALTER TABLE "StravaToken"
ADD COLUMN "oauthClientIdEnc" TEXT,
ADD COLUMN "oauthClientSecretEnc" TEXT;
