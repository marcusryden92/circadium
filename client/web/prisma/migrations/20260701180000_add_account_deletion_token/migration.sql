-- Short-lived tokens for the email-confirmation step of account deletion.
-- One row per user (userId is unique); a new request replaces the old row.
-- Cascade so a token disappears if the user is deleted through any path.

CREATE TABLE "public"."AccountDeletionToken" (
  "id"      TEXT NOT NULL,
  "userId"  TEXT NOT NULL,
  "token"   TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletionToken_userId_key" ON "public"."AccountDeletionToken"("userId");
CREATE UNIQUE INDEX "AccountDeletionToken_token_key" ON "public"."AccountDeletionToken"("token");

ALTER TABLE "public"."AccountDeletionToken"
  ADD CONSTRAINT "AccountDeletionToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
