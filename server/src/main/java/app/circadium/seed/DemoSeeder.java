package app.circadium.seed;

import app.circadium.persistence.DbTime;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Run with {@code --circadium.seed.enabled=true}: upserts the predictable admin sign-in
 * (admin@circadium.app / "password"), then wholesale-replaces the demo calendar dataset. Engine-output
 * tables stay empty — the web regenerates them on first load. Deadlines and plan anchors are relative to
 * "now" so the demo calendar never ages into the past.
 */
@Component
@Profile("local")
@ConditionalOnProperty(name = "circadium.seed.enabled", havingValue = "true")
@RequiredArgsConstructor
@Slf4j
public class DemoSeeder implements CommandLineRunner {

    private static final String USER_ID = "1";
    private static final double SORT_STEP = 1024;
    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);
    private static final String[] WEEK_DAYS =
            {"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"};
    private static final String WEEKLY = "{\"freq\":\"weekly\",\"interval\":1,\"until\":null}";

    private static final String HOME = "seed-location-home";
    private static final String WORK = "seed-location-work";
    private static final String GYM = "seed-location-gym";
    private static final String SCHOOL = "seed-location-school";

    private static final String PROFESSIONAL = "seed-category-professional";
    private static final String FAMILY = "seed-category-family";
    private static final String HEALTH = "seed-category-health";
    private static final String DEEP_WORK = "seed-category-deep-work";
    private static final String FITNESS = "seed-category-fitness";

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;

    private int plannerRows;

    @Override
    @Transactional
    public void run(String... args) {
        Instant now = DbTime.now(clock);
        LocalDateTime dbNow = DbTime.toDb(now);

        upsertAdmin(dbNow);
        wipe();
        seedLocations(dbNow);
        seedTravelTimes(dbNow);
        seedCategories(dbNow);
        seedTemplates(dbNow);
        seedPlanners(now, dbNow);
        seedPlans(now, dbNow);

        log.info("Seeding completed: admin@circadium.app (onboarded) + demo dataset: 4 locations, "
                + "8 travel times, 5 categories, 12 templates, {} planner rows", plannerRows);
    }

    /** The reseed never deletes the admin (the TS seed's upsert semantics), so sessions survive it. */
    private void upsertAdmin(LocalDateTime now) {
        jdbc.update("""
                INSERT INTO "users" ("id", "name", "email", "email_verified", "password", "role", "onboarded_at")
                VALUES (?, ?, ?, ?, ?, ?::"UserRole", ?)
                ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name", "onboarded_at" = EXCLUDED."onboarded_at"
                """, USER_ID, "Jane Smith", "admin@circadium.app", now,
                passwordEncoder.encode("password"), "ADMIN", now);
    }

    /**
     * Whole tables, not per-user: this is the throwaway local database. Children before parents;
     * engine-output rows go too, since they rebuild on the next regen. Tables that only cascade on a
     * user delete (queues, habit buckets, chats) must be named or stale rows would survive the reseed.
     */
    private void wipe() {
        for (String table : List.of("CategoryEvents", "TravelEvents", "SimpleEvents", "EngineMessages",
                "PlannerDependencies", "QueueMembers", "Queues", "HabitItems", "Habits", "HabitBuckets",
                "HabitCompletions", "Planners", "EventTemplates", "CategoryTimeWindows", "Categories",
                "TravelTimes", "Locations", "DraftConversations")) {
            jdbc.update("DELETE FROM \"" + table + "\"");
        }
    }

    /** The retired TS seed's everyday radius: home, an office ~25 minutes away, a gym, the kids' school. */
    private void seedLocations(LocalDateTime now) {
        insertLocation(HOME, "Home", "Gillevägen 3, 131 33 Nacka, Sweden",
                "ChIJPUGkuDx5X0YRwDXn1hCYtSA", 59.3107, 18.1234, now);
        insertLocation(WORK, "Office", "Munkbrohamnen, 111 28 Stockholm, Sweden",
                "ChIJqyKCOwB3X0YRXKldXP9fc5w", 59.3233, 18.0689, now);
        insertLocation(GYM, "Gym", "Smedjegatan 14, 131 54 Nacka, Sweden",
                "ChIJ4ZnQW214X0YRGZckLga3iIw", 59.3067, 18.1567, now);
        insertLocation(SCHOOL, "School", "Griffelvägen 11, 131 40 Nacka, Sweden",
                "ChIJq3rNvGx4X0YR4bGGYEqrxRs", 59.3085, 18.1402, now);
    }

    private void insertLocation(String id, String name, String address, String placeId,
            double lat, double lng, LocalDateTime now) {
        jdbc.update("""
                INSERT INTO "Locations" ("id", "name", "address", "placeId", "lat", "lng", "userId",
                    "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, name, address, placeId, lat, lng, USER_ID, now, now);
    }

    private void seedTravelTimes(LocalDateTime now) {
        travelPair(HOME, WORK, 35, 25, 20, now);
        travelPair(HOME, GYM, 12, 10, 8, now);
        travelPair(HOME, SCHOOL, 8, 6, 5, now);
        travelPair(WORK, GYM, 30, 22, 18, now);
    }

    private void travelPair(String a, String b, int rush, int regular, int night, LocalDateTime now) {
        insertTravelTime(a, b, rush, regular, night, now);
        insertTravelTime(b, a, rush, regular, night, now);
    }

    private void insertTravelTime(String from, String to, int rush, int regular, int night,
            LocalDateTime now) {
        jdbc.update("""
                INSERT INTO "TravelTimes" ("id", "fromLocationId", "toLocationId", "transportMode",
                    "googleRushHourMinutes", "googleRegularMinutes", "googleNightMinutes", "userId",
                    "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?::"TransportMode", ?, ?, ?, ?, ?, ?)
                """, "seed-travel-" + from + "-" + to, from, to, "DRIVING", rush, regular, night,
                USER_ID, now, now);
    }

    /** Top-level categories are the user-facing roles; windows attach to the nested sub-categories. */
    private void seedCategories(LocalDateTime now) {
        insertCategory(PROFESSIONAL, "Professional", "#3B82F6", 0, false, null, null, now);
        insertCategory(FAMILY, "Family", "#DC2626", 1, false, null, null, now);
        insertCategory(HEALTH, "Health", "#16A34A", 2, false, null, null, now);
        insertCategory(DEEP_WORK, "Deep work", "#2563EB", 0, true, null, PROFESSIONAL, now);
        insertCategory(FITNESS, "Fitness", "#15803D", 0, true, GYM, HEALTH, now);

        for (int day = 1; day <= 5; day++) {
            insertWindow("seed-window-deep-work-" + day, day, "09:00", "12:00", DEEP_WORK);
        }
        for (int day : new int[] {1, 3, 5}) {
            insertWindow("seed-window-fitness-" + day, day, "17:30", "19:00", FITNESS);
        }
    }

    private void insertCategory(String id, String name, String color, int sortOrder,
            boolean useTimeWindows, String locationId, String parentId, LocalDateTime now) {
        jdbc.update("""
                INSERT INTO "Categories" ("id", "name", "color", "sortOrder", "useTimeWindows", "isStrict",
                    "confineToOwnWindows", "locationId", "parentId", "userId", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, false, false, ?, ?, ?, ?, ?)
                """, id, name, color, sortOrder, useTimeWindows, locationId, parentId, USER_ID, now, now);
    }

    private void insertWindow(String id, int day, String startTime, String endTime, String categoryId) {
        jdbc.update("""
                INSERT INTO "CategoryTimeWindows" ("id", "day", "startTime", "endTime", "categoryId", "userId")
                VALUES (?, ?, ?, ?, ?, ?)
                """, id, day, startTime, endTime, categoryId, USER_ID);
    }

    /** Sleep is one overnight block per day (the engine renders the midnight crossing itself). */
    private void seedTemplates(LocalDateTime now) {
        for (int day = 0; day <= 6; day++) {
            insertTemplate("seed-template-sleep-" + day, "Sleep", day, "23:00", 480, null, now);
        }
        for (int day = 1; day <= 5; day++) {
            insertTemplate("seed-template-morning-" + day, "Morning routine", day, "07:00", 45, HOME, now);
        }
    }

    private void insertTemplate(String id, String title, int day, String startTime, int duration,
            String locationId, LocalDateTime now) {
        jdbc.update("""
                INSERT INTO "EventTemplates" ("id", "title", "startDay", "startTime", "duration",
                    "locationId", "userId", "createdAt")
                VALUES (?, ?, ?::"WeekDayType", ?, ?, ?, ?, ?)
                """, id, title, WEEK_DAYS[day], startTime, duration, locationId, USER_ID, now);
    }

    private void seedPlanners(Instant now, LocalDateTime dbNow) {
        insertTree(Node.branch("Launch personal website",
                        Node.leaf("Choose a tech stack", 60),
                        Node.leaf("Design the layout", 90),
                        Node.branch("Build the landing page",
                                Node.leaf("Hero section", 60),
                                Node.leaf("Contact form", 45)),
                        Node.leaf("Deploy", 30)),
                "seed-goal-1", null, 0, "#60A5FA", PROFESSIONAL, deadline(now, 21), dbNow);
        insertTree(Node.branch("Spring garden overhaul",
                        Node.leaf("Clear the beds", 90),
                        Node.leaf("Buy soil and seeds", 45),
                        Node.leaf("Plant vegetables", 120)),
                "seed-goal-2", null, 0, "#F87171", FAMILY, deadline(now, 35), dbNow);

        insertPlanner("seed-recurring-1", "Weekly review", null, "task", 30, null, null, WEEKLY,
                "{\"days\":[0],\"ranges\":null}", 0, 5, "#60A5FA", null, false, PROFESSIONAL, dbNow);
        insertPlanner("seed-task-1", "Renew passport", null, "task", 60, deadline(now, 14), null, null,
                null, 0, 5, "#F59E0B", null, false, null, dbNow);
    }

    private void seedPlans(Instant now, LocalDateTime dbNow) {
        insertPlanner("seed-plan-1", "Dentist appointment", null, "plan", 60, null, starts(now, 3), null,
                null, 0, 4, "#F59E0B", null, false, null, dbNow);
        insertPlanner("seed-plan-2", "Team offsite", null, "plan", 240, null, starts(now, 10), null,
                null, 0, 4, "#60A5FA", WORK, false, PROFESSIONAL, dbNow);
        insertPlanner("seed-plan-3", "Family dinner", null, "plan", 120, null, starts(now, 2), WEEKLY,
                null, 0, 4, "#DC2626", null, false, FAMILY, dbNow);
    }

    private static String deadline(Instant now, int days) {
        return ISO_MILLIS.format(now.plus(days, ChronoUnit.DAYS));
    }

    /** A clean on-the-hour anchor, so demo plans do not start mid-minute. */
    private static String starts(Instant now, int days) {
        return ISO_MILLIS.format(now.plus(days, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS));
    }

    private record Node(String title, int duration, List<Node> children) {

        static Node leaf(String title, int duration) {
            return new Node(title, duration, List.of());
        }

        static Node branch(String title, Node... children) {
            return new Node(title, 0, List.of(children));
        }
    }

    /**
     * Children before their parent (parentId has no DB foreign key), each branch's duration the rolled-up
     * sum of its leaves — the retired TS generator's conventions. categoryId and a deadline ride the root
     * only; descendants inherit both by parent-chain walk.
     */
    private int insertTree(Node node, String id, String parentId, int siblingIndex, String color,
            String categoryId, String deadline, LocalDateTime now) {
        int childSum = 0;
        for (int i = 0; i < node.children().size(); i++) {
            childSum += insertTree(node.children().get(i), id + "-" + (i + 1), id, i, color, null, null, now);
        }
        boolean leaf = node.children().isEmpty();
        boolean root = parentId == null;
        int duration = leaf ? node.duration() : childSum;
        insertPlanner(id, node.title(), parentId, leaf ? "task" : "goal", duration, deadline, null, null,
                null, root ? 0 : (siblingIndex + 1) * SORT_STEP, 4, color, null, !root, categoryId, now);
        return duration;
    }

    private void insertPlanner(String id, String title, String parentId, String plannerType, int duration,
            String deadline, String starts, String recurrence, String allowedTimes, double sortOrder,
            int priority, String color, String locationId, boolean useParentLocation, String categoryId,
            LocalDateTime now) {
        plannerRows++;
        jdbc.update("""
                INSERT INTO "Planners" ("id", "title", "parentId", "plannerType", "isReady", "isTriaged",
                    "duration", "deadline", "starts", "recurrence", "allowedTimes", "sortOrder", "priority",
                    "userId", "color", "locationId", "useParentLocation", "categoryId", "createdAt")
                VALUES (?, ?, ?, ?::"PlannerType", true, true, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, title, parentId, plannerType, duration, deadline, starts, recurrence, allowedTimes,
                sortOrder, priority, USER_ID, color, locationId, useParentLocation, categoryId, now);
    }
}
