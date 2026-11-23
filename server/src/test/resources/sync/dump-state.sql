-- Every row the sync can write for the two accounts in calendar/bootstrap-seed.sql, as one JSON
-- document with each table's rows ordered by id. The golden corpus was captured from the web's
-- original sync (the TS sync's effect) before it was retired (plan 1.13); SyncCorpusIntegrationTest
-- now runs this same query to compare the Java sync's effect against the frozen corpus, so Postgres
-- renders every value identically. Ids sort bytewise, as collations differ between the Alpine dev
-- image and the Debian test image.
SELECT json_build_object(
    'users', (SELECT json_agg(json_build_object('id', u."id", 'dataVersion', u."dataVersion") ORDER BY u."id" COLLATE "C")
        FROM "users" u WHERE u."id" IN ('bootstrap-user', 'bootstrap-other')),
    'Locations', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "Locations" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'TravelTimes', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "TravelTimes" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'Categories', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "Categories" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'CategoryTimeWindows', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "CategoryTimeWindows" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'Planners', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "Planners" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'SimpleEvents', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "SimpleEvents" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'EventExtendedProps', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "EventExtendedProps" t
        JOIN "SimpleEvents" e ON e."id" = t."eventId" WHERE e."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'EventTemplates', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "EventTemplates" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'CategoryEvents', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "CategoryEvents" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'TravelEvents', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "TravelEvents" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'EngineMessages', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "EngineMessages" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'Queues', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "Queues" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'QueueMembers', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "QueueMembers" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other')),
    'PlannerDependencies', (SELECT coalesce(json_agg(t ORDER BY t."id" COLLATE "C"), '[]') FROM "PlannerDependencies" t
        WHERE t."userId" IN ('bootstrap-user', 'bootstrap-other'))
)::text AS state
