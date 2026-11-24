-- The draft-conversation writes move to Java (plan 2.3), so the TEXT timestamps migrate to
-- timestamp(3) with them (the 1.13b per-group rule). Java stamps createdAt/updatedAt itself
-- (the UserViewStates pattern) — the (now())::text default goes with the TEXT type. The USING
-- cast preserves every existing value: updatedAt was written as toISOString() by the retired
-- action, createdAt by the UTC server's (now())::text default.
ALTER TABLE "DraftConversations"
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::timestamp(3),
    ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::timestamp(3);
