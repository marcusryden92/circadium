-- CreateTable
CREATE TABLE "FeedbackReports" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dataSnapshot" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,

    CONSTRAINT "FeedbackReports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,

    CONSTRAINT "Suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionVotes" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL DEFAULT (now())::text,

    CONSTRAINT "SuggestionVotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackReports_userId_idx" ON "FeedbackReports"("userId");

-- CreateIndex
CREATE INDEX "Suggestions_userId_idx" ON "Suggestions"("userId");

-- CreateIndex
CREATE INDEX "SuggestionVotes_userId_idx" ON "SuggestionVotes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionVotes_suggestionId_userId_key" ON "SuggestionVotes"("suggestionId", "userId");

-- AddForeignKey
ALTER TABLE "FeedbackReports" ADD CONSTRAINT "FeedbackReports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestions" ADD CONSTRAINT "Suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionVotes" ADD CONSTRAINT "SuggestionVotes_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionVotes" ADD CONSTRAINT "SuggestionVotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
