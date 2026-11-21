-- CreateTable
CREATE TABLE "DraftConversations" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "DraftConversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftConversations_userId_idx" ON "DraftConversations"("userId");

-- AddForeignKey
ALTER TABLE "DraftConversations" ADD CONSTRAINT "DraftConversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
