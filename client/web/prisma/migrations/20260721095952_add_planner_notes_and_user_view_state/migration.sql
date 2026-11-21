-- AlterTable
ALTER TABLE "Planners" ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "UserViewStates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "graph" TEXT,
    "mindmap" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserViewStates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserViewStates_userId_key" ON "UserViewStates"("userId");

-- AddForeignKey
ALTER TABLE "UserViewStates" ADD CONSTRAINT "UserViewStates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
