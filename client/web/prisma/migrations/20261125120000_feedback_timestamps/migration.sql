-- The feedback writes move to Java (plan 2.4), so the TEXT timestamps migrate to timestamp(3)
-- with them (the 1.13b per-group rule). Java stamps createdAt itself (the DraftConversations
-- pattern) — the (now())::text default goes with the TEXT type. The USING cast preserves every
-- existing value: all three columns were only ever written by the UTC server's (now())::text
-- default.
ALTER TABLE "FeedbackReports"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3);

ALTER TABLE "Suggestions"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3);

ALTER TABLE "SuggestionVotes"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3);
