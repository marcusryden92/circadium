-- CreateTable
CREATE TABLE "oauth_handoff_codes" (
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_handoff_codes_pkey" PRIMARY KEY ("codeHash")
);

-- CreateIndex
CREATE INDEX "oauth_handoff_codes_userId_idx" ON "oauth_handoff_codes"("userId");

-- CreateIndex
CREATE INDEX "oauth_handoff_codes_expiresAt_idx" ON "oauth_handoff_codes"("expiresAt");

-- AddForeignKey
ALTER TABLE "oauth_handoff_codes" ADD CONSTRAINT "oauth_handoff_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

