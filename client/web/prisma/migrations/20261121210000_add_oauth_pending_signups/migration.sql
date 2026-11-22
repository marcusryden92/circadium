-- CreateTable
CREATE TABLE "oauth_pending_signups" (
    "tokenHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_pending_signups_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "oauth_pending_signups_expiresAt_idx" ON "oauth_pending_signups"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_pending_signups_provider_subject_key" ON "oauth_pending_signups"("provider", "subject");
