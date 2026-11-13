ALTER TABLE "users" ADD COLUMN "onboarded_at" TIMESTAMP(3);

-- Existing users have already been using the app; treat them as onboarded so
-- the first-run redirect only fires for genuinely new accounts.
UPDATE "users" SET "onboarded_at" = NOW() WHERE "onboarded_at" IS NULL;
