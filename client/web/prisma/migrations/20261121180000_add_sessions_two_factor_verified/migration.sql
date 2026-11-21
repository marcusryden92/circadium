-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "twoFactorVerified" BOOLEAN NOT NULL DEFAULT false;
