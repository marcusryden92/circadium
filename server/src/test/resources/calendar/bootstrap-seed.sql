-- The calendar state behind bootstrap-expected.json. The expected JSON was captured from the web's
-- original fetcher before it was retired (plan 1.13); CalendarBootstrapIntegrationTest now compares
-- the Java endpoint against it. Regenerating the fixture after changing this file is now done
-- Java-side.
--
-- Rows cover the shapes that could drift: nulls next to values, a fractional sortOrder, an
-- event without extendedProps and one whose plannerType is null, both ends of the weekday
-- mapping, JSON payloads of every kind, an unroutable travel time, a time window whose
-- category was deleted, and a second account whose rows must not appear.

INSERT INTO "users" ("id", "name", "email", "dataVersion") VALUES
    ('bootstrap-user', 'Bootstrap User', 'bootstrap-user@example.test', 7),
    ('bootstrap-other', 'Other User', 'bootstrap-other@example.test', 3);

-- Location b is older than a, so the oldest-first order differs from id order.
INSERT INTO "Locations" ("id", "name", "address", "placeId", "lat", "lng", "userId", "createdAt", "updatedAt") VALUES
    ('bootstrap-location-a', 'Office', '1 Main Street', 'place-office', 59.3293, 18.0686, 'bootstrap-user',
        '2026-01-02 08:00:00.000', '2026-01-05 08:00:00.000'),
    ('bootstrap-location-b', 'Home', '2 Side Street', 'place-home', 59.3300, 18.0700, 'bootstrap-user',
        '2026-01-01 08:00:00.000', '2026-01-01 08:00:00.000'),
    ('bootstrap-other-location', 'Elsewhere', '3 Far Road', 'place-elsewhere', 0, 0, 'bootstrap-other',
        '2026-01-01 08:00:00.000', '2026-01-01 08:00:00.000');

INSERT INTO "TravelTimes" ("id", "fromLocationId", "toLocationId", "transportMode", "googleRushHourMinutes",
        "googleRegularMinutes", "googleNightMinutes", "customRushHourMinutes", "customRegularMinutes",
        "customNightMinutes", "unroutableAt", "userId", "createdAt", "updatedAt") VALUES
    ('bootstrap-travel-time-1', 'bootstrap-location-a', 'bootstrap-location-b', 'DRIVING', 20, 15, 12,
        NULL, NULL, NULL, NULL, 'bootstrap-user', '2026-01-03 08:00:00.000', '2026-01-03 08:00:00.000'),
    ('bootstrap-travel-time-2', 'bootstrap-location-b', 'bootstrap-location-a', 'TRANSIT', 0, 0, 0,
        30, NULL, 25, '2026-02-01 00:00:00.000', 'bootstrap-user', '2026-01-03 08:00:00.000',
        '2026-02-01 00:00:00.000'),
    ('bootstrap-other-travel-time', 'bootstrap-other-location', 'bootstrap-other-location', 'WALKING', 1, 1, 1,
        NULL, NULL, NULL, NULL, 'bootstrap-other', '2026-01-03 08:00:00.000', '2026-01-03 08:00:00.000');

INSERT INTO "Categories" ("id", "name", "icon", "color", "sortOrder", "useTimeWindows", "isStrict",
        "confineToOwnWindows", "locationId", "parentId", "userId", "createdAt", "updatedAt") VALUES
    ('bootstrap-category-a', 'Work', 'briefcase', '#336699', 1, true, true, false, 'bootstrap-location-a', NULL,
        'bootstrap-user', '2026-01-04T09:00:00.000Z', '2026-01-04T09:00:00.000Z'),
    ('bootstrap-category-b', 'Deep work', NULL, NULL, 0, false, false, true, NULL, 'bootstrap-category-a',
        'bootstrap-user', '2026-01-04T09:05:00.000Z', '2026-01-06T09:05:00.000Z'),
    ('bootstrap-other-category', 'Theirs', NULL, NULL, 0, true, false, false, NULL, NULL,
        'bootstrap-other', '2026-01-04T09:00:00.000Z', '2026-01-04T09:00:00.000Z');

-- The orphan window (categoryId null) belongs to the user but to no category, so no category lists it.
INSERT INTO "CategoryTimeWindows" ("id", "day", "startTime", "endTime", "recurrenceExceptions", "categoryId",
        "userId") VALUES
    ('bootstrap-window-1', 0, '09:00', '12:00', '{"2026-03-01":{"deleted":true}}', 'bootstrap-category-a',
        'bootstrap-user'),
    ('bootstrap-window-2', 6, '13:00', '17:00', NULL, 'bootstrap-category-a', 'bootstrap-user'),
    ('bootstrap-window-orphan', 3, '08:00', '09:00', NULL, NULL, 'bootstrap-user'),
    ('bootstrap-other-window', 2, '10:00', '11:00', NULL, 'bootstrap-other-category', 'bootstrap-other');

INSERT INTO "Planners" ("id", "title", "parentId", "plannerType", "isReady", "isTriaged", "duration", "deadline",
        "starts", "recurrence", "recurrenceExceptions", "splitting", "completedSegments", "maxMinutesPerDay",
        "earliestStartDate", "allowedTimes", "linkedItemId", "notes", "sortOrder", "completedStartTime",
        "completedEndTime", "priority", "userId", "color", "locationId", "useParentLocation", "categoryId",
        "createdAt", "updatedAt") VALUES
    ('bootstrap-planner-goal', 'Learn Spanish', NULL, 'goal', true, true, 0, '2026-06-30T00:00:00.000Z',
        NULL, NULL, NULL, NULL, NULL, 90, '2026-01-05T00:00:00.000Z', '{"days":[1,2,3],"ranges":[]}', NULL,
        'Notes with "quotes", a backslash \ and unicode: café', 0, NULL, NULL, 5, 'bootstrap-user', '#aa3355',
        NULL, false, 'bootstrap-category-a', '2026-01-10T10:00:00.000Z', '2026-01-11T10:00:00.000Z'),
    ('bootstrap-planner-plan', 'Weekly review', NULL, 'plan', true, true, 60, NULL,
        '2026-03-02T09:00:00.000Z', '{"freq":"weekly","interval":1}', '{}', NULL, NULL, NULL, NULL, NULL, NULL,
        NULL, 0, NULL, NULL, 3, 'bootstrap-user', NULL, 'bootstrap-location-b', false, NULL,
        '2026-01-10T10:01:00.000Z', '2026-01-10T10:01:00.000Z'),
    ('bootstrap-planner-task', 'Flashcards', 'bootstrap-planner-goal', 'task', NULL, false, 45, NULL,
        NULL, NULL, NULL, '{"minMinutes":15,"maxMinutes":45}',
        '[{"start":"2026-03-03T08:00:00.000Z","end":"2026-03-03T08:15:00.000Z"}]', NULL, NULL, NULL,
        'bootstrap-planner-plan', NULL, 1.5, '2026-03-03T08:00:00.000Z', '2026-03-03T08:15:00.000Z', 1,
        'bootstrap-user', NULL, NULL, true, NULL, '2026-01-10T10:02:00.000Z', '2026-01-10T10:02:00.000Z'),
    ('bootstrap-other-planner', 'Not yours', NULL, 'task', true, true, 30, NULL, NULL, NULL, NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, 1, 'bootstrap-other', NULL, NULL, false, NULL,
        '2026-01-10T10:00:00.000Z', '2026-01-10T10:00:00.000Z');

INSERT INTO "SimpleEvents" ("id", "title", "start", "end", "duration", "userId", "rrule", "backgroundColor",
        "borderColor", "createdAt", "updatedAt") VALUES
    ('bootstrap-event-1', 'Flashcards', '2026-03-03T08:00:00.000Z', '2026-03-03T08:45:00.000Z', 45,
        'bootstrap-user', NULL, '#aa3355', '#aa3355', '2026-03-01T12:00:00.000Z', '2026-03-01T12:00:00.000Z'),
    ('bootstrap-event-2', 'Weekly review', '2026-03-02T09:00:00.000Z', '2026-03-02T10:00:00.000Z', NULL,
        'bootstrap-user', 'FREQ=WEEKLY;INTERVAL=1', '#777777', '#555555', '2026-03-01T12:00:00.000Z',
        '2026-03-01T12:00:00.000Z'),
    ('bootstrap-event-3', 'Morning routine', '2026-03-01T07:00:00.000Z', '2026-03-01T07:30:00.000Z', 30,
        'bootstrap-user', NULL, '#888888', '#888888', '2026-03-01T12:00:00.000Z', '2026-03-01T12:00:00.000Z'),
    ('bootstrap-other-event', 'Not yours', '2026-03-03T08:00:00.000Z', '2026-03-03T08:30:00.000Z', 30,
        'bootstrap-other', NULL, '#000000', '#000000', '2026-03-01T12:00:00.000Z', '2026-03-01T12:00:00.000Z');

INSERT INTO "EventExtendedProps" ("id", "plannerType", "eventType", "completedStartTime", "completedEndTime",
        "parentId", "trespassingStart", "trespassingEnd", "eventId") VALUES
    ('bootstrap-props-1', 'task', 'planner', '2026-03-03T08:00:00.000Z', NULL, 'bootstrap-planner-goal', true,
        false, 'bootstrap-event-1'),
    ('bootstrap-props-3', NULL, 'template', NULL, NULL, NULL, false, false, 'bootstrap-event-3'),
    ('bootstrap-other-props', 'task', 'planner', NULL, NULL, NULL, false, false, 'bootstrap-other-event');

INSERT INTO "EventTemplates" ("id", "title", "startDay", "startTime", "userId", "duration", "color",
        "locationId", "recurrenceExceptions", "createdAt", "updatedAt") VALUES
    ('bootstrap-template-1', 'Morning routine', 'sunday', '07:00', 'bootstrap-user', 30, NULL,
        'bootstrap-location-a', NULL, '2026-01-04T09:00:00.000Z', '2026-01-04T09:00:00.000Z'),
    ('bootstrap-template-2', 'Review', 'saturday', '18:30', 'bootstrap-user', 45, '#112233', NULL,
        '{"2026-03-07":{"deleted":true}}', '2026-01-04T09:00:00.000Z', '2026-01-08T09:00:00.000Z'),
    ('bootstrap-other-template', 'Theirs', 'wednesday', '12:00', 'bootstrap-other', 15, NULL, NULL, NULL,
        '2026-01-04T09:00:00.000Z', '2026-01-04T09:00:00.000Z');

INSERT INTO "CategoryEvents" ("id", "start", "end", "trespassingStart", "trespassingEnd", "categoryTimeWindowId",
        "categoryId", "userId", "createdAt", "updatedAt") VALUES
    ('bootstrap-category-event-1', '2026-03-01T09:00:00.000Z', '2026-03-01T12:00:00.000Z', false, true,
        'bootstrap-window-1', 'bootstrap-category-a', 'bootstrap-user', '2026-03-01T12:00:00.000Z',
        '2026-03-01T12:00:00.000Z'),
    ('bootstrap-other-category-event', '2026-03-03T10:00:00.000Z', '2026-03-03T11:00:00.000Z', false, false,
        'bootstrap-other-window', 'bootstrap-other-category', 'bootstrap-other', '2026-03-01T12:00:00.000Z',
        '2026-03-01T12:00:00.000Z');

INSERT INTO "TravelEvents" ("id", "start", "end", "fromLocationId", "toLocationId", "travelMinutes",
        "requiredTravelMinutes", "insufficientTravel", "overconstrained", "userId", "createdAt", "updatedAt") VALUES
    ('bootstrap-travel-event-1', '2026-03-02T08:40:00.000Z', '2026-03-02T09:00:00.000Z', NULL,
        'bootstrap-location-b', 20, NULL, false, true, 'bootstrap-user', '2026-03-01T12:00:00.000Z',
        '2026-03-01T12:00:00.000Z'),
    ('bootstrap-travel-event-2', '2026-03-03T07:45:00.000Z', '2026-03-03T08:00:00.000Z', 'bootstrap-location-b',
        'bootstrap-location-a', 15, 25, true, false, 'bootstrap-user', '2026-03-01T12:00:00.000Z',
        '2026-03-01T12:00:00.000Z'),
    ('bootstrap-other-travel-event', '2026-03-03T07:45:00.000Z', '2026-03-03T08:00:00.000Z', NULL, NULL, 5, NULL,
        false, false, 'bootstrap-other', '2026-03-01T12:00:00.000Z', '2026-03-01T12:00:00.000Z');

INSERT INTO "EngineMessages" ("id", "type", "tone", "payload", "dismissed", "userId", "createdAt", "updatedAt")
VALUES
    ('bootstrap-message-1', 'unscheduled', 'warning',
        '{"plannerId":"bootstrap-planner-task","reason":"NO_SLOTS","details":{"tried":[1,2.5,"x",null,true],"note":"a \"quote\" and café"}}',
        false, 'bootstrap-user', '2026-03-01T12:00:00.000Z', '2026-03-01T12:00:00.000Z'),
    ('bootstrap-message-2', 'info', 'neutral', '"just a string"', true, 'bootstrap-user',
        '2026-03-01T12:00:00.000Z', '2026-03-02T12:00:00.000Z'),
    ('bootstrap-message-3', 'info', 'neutral', '[{"leaf":"x"},2,[]]', false, 'bootstrap-user',
        '2026-03-01T12:00:00.000Z', '2026-03-01T12:00:00.000Z'),
    ('bootstrap-other-message', 'info', 'neutral', '{}', false, 'bootstrap-other', '2026-03-01T12:00:00.000Z',
        '2026-03-01T12:00:00.000Z');

INSERT INTO "Queues" ("id", "title", "sortOrder", "color", "categoryId", "userId", "createdAt", "updatedAt") VALUES
    ('bootstrap-queue-1', 'Reading', 0, '#445566', 'bootstrap-category-a', 'bootstrap-user',
        '2026-01-12T10:00:00.000Z', '2026-01-12T10:00:00.000Z'),
    ('bootstrap-queue-2', 'Empty', 1, NULL, NULL, 'bootstrap-user', '2026-01-12T10:00:00.000Z',
        '2026-01-12T10:00:00.000Z'),
    ('bootstrap-other-queue', 'Theirs', 0, NULL, NULL, 'bootstrap-other', '2026-01-12T10:00:00.000Z',
        '2026-01-12T10:00:00.000Z');

INSERT INTO "QueueMembers" ("id", "sortOrder", "queueId", "plannerId", "userId", "createdAt", "updatedAt") VALUES
    ('bootstrap-member-1', 0.25, 'bootstrap-queue-1', 'bootstrap-planner-goal', 'bootstrap-user',
        '2026-01-12T10:00:00.000Z', '2026-01-12T10:00:00.000Z'),
    ('bootstrap-member-2', 1, 'bootstrap-queue-1', 'bootstrap-planner-plan', 'bootstrap-user',
        '2026-01-12T10:00:00.000Z', '2026-01-12T10:00:00.000Z'),
    ('bootstrap-other-member', 0, 'bootstrap-other-queue', 'bootstrap-other-planner', 'bootstrap-other',
        '2026-01-12T10:00:00.000Z', '2026-01-12T10:00:00.000Z');

INSERT INTO "PlannerDependencies" ("id", "predecessorId", "successorId", "userId", "createdAt", "updatedAt") VALUES
    ('bootstrap-dependency-1', 'bootstrap-planner-plan', 'bootstrap-planner-goal', 'bootstrap-user',
        '2026-01-13T10:00:00.000Z', '2026-01-13T10:00:00.000Z');

-- Non-default values on every wire field, so a mapping slip cannot hide behind a default; the other
-- account's row proves the bootstrap scopes the single-row read. The table has no FK to users (a
-- NextAuth-era shape), so user-delete cleanups never cascade here — the reseed clears its own rows.
DELETE FROM "UserSchedulingPreferences" WHERE "userId" IN ('bootstrap-user', 'bootstrap-other');
INSERT INTO "UserSchedulingPreferences" ("id", "userId", "bufferTimeMinutes", "defaultTransportMode",
        "weekStartDay", "lastTravelRefreshAt", "lastTravelTopUpAt", "createdAt", "updatedAt") VALUES
    ('bootstrap-preferences', 'bootstrap-user', 15, 'TRANSIT', 0, '2026-02-01 00:00:00.000', NULL,
        '2026-01-02 08:00:00.000', '2026-02-01 00:00:00.000'),
    ('bootstrap-other-preferences', 'bootstrap-other', 25, 'WALKING', 6, NULL, NULL,
        '2026-01-02 08:00:00.000', '2026-01-02 08:00:00.000');
