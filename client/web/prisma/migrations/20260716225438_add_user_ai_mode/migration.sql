-- CreateEnum
CREATE TYPE "AiMode" AS ENUM ('BYOK', 'MANAGED', 'OFF');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_mode" "AiMode";
