-- Email-change verification binds the token to the NEW address, which no
-- user row has yet — the consumer must resolve the user by id instead of by
-- email. Nullable: registration tokens keep resolving by email. Cascade so
-- pending tokens die with the account.

-- AlterTable
ALTER TABLE "VerificationToken" ADD COLUMN "userId" TEXT;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
