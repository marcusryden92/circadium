package app.circadium.sync;

import app.circadium.calendar.CalendarBootstrapService;
import app.circadium.calendar.CalendarContracts.DatabaseChanges;
import app.circadium.calendar.CalendarContracts.SyncRequest;
import app.circadium.calendar.CalendarContracts.SyncResult;
import app.circadium.ws.DataVersionBroadcaster;
import java.time.Clock;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.stream.Stream;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Applies a client's diff under optimistic concurrency. The account's {@code dataVersion} is the token: a sync
 * computed against version {@code n} commits only while the account is still at {@code n}, and moves it to
 * {@code n + 1}. A sync computed against anything else is rejected with the current state, which the client adopts
 * wholesale, since applying part of a diff to rows it never saw could break the planner tree.
 */
@Service
public class CalendarSyncService {

    /**
     * The first regen after loading a large calendar writes hundreds of rows in one sync. The bound keeps a runaway
     * diff from holding the account's row lock, and a pooled connection, indefinitely.
     */
    private static final int TIMEOUT_SECONDS = 60;

    /** JavaScript's {@code toISOString()}: always three fractional digits, which the web's timestamps all carry. */
    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private final JdbcTemplate jdbcTemplate;
    private final CalendarChangeWriter writer;
    private final CalendarBootstrapService bootstrapService;
    private final DataVersionBroadcaster broadcaster;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    CalendarSyncService(JdbcTemplate jdbcTemplate, CalendarChangeWriter writer,
            CalendarBootstrapService bootstrapService, DataVersionBroadcaster broadcaster,
            PlatformTransactionManager transactionManager, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.writer = writer;
        this.bootstrapService = bootstrapService;
        this.broadcaster = broadcaster;
        this.clock = clock;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.transactionTemplate.setTimeout(TIMEOUT_SECONDS);
    }

    /** @throws StaleSyncException when the account has moved past {@code clientKnownDataVersion} */
    public SyncResult sync(String userId, SyncRequest request) {
        DatabaseChanges changes = request.changes();
        int knownVersion = request.clientKnownDataVersion();

        // An empty diff must not bump the version: every other session's next sync would then be rejected as
        // stale and drop its in-flight edits.
        if (isEmpty(changes)) {
            return new SyncResult(knownVersion);
        }

        String now = ISO_MILLIS.format(clock.instant());
        boolean applied = Boolean.TRUE.equals(transactionTemplate.execute(status -> {
            // First, so the row lock it takes queues a concurrent sync for the same account behind this one; that
            // sync's version check then sees the bumped version and fails.
            int bumped = jdbcTemplate.update(
                    "UPDATE \"users\" SET \"dataVersion\" = \"dataVersion\" + 1 WHERE \"id\" = ? AND \"dataVersion\" = ?",
                    userId, knownVersion);
            if (bumped == 0) {
                return false;
            }
            writer.write(userId, changes, now);
            return true;
        }));

        if (!applied) {
            // Read in a transaction of its own, after this one ended: the bootstrap read sets its isolation level,
            // which Postgres allows only before a transaction's first query. A missing account fails here with
            // account_not_found.
            throw new StaleSyncException(bootstrapService.load(userId));
        }
        int newVersion = knownVersion + 1;
        // After the commit, so the other sessions only ever hear of a durable version. The tab that synced receives
        // this too and ignores it, its known version already being newVersion.
        broadcaster.broadcast(userId, newVersion);
        return new SyncResult(newVersion);
    }

    private static boolean isEmpty(DatabaseChanges changes) {
        return Stream.of(changes.planner(), changes.calendar(), changes.template(), changes.extendedProps(),
                        changes.category(), changes.categoryTimeWindow(), changes.categoryEvent(),
                        changes.travelEvent(), changes.engineMessage(), changes.queue(), changes.queueMember(),
                        changes.dependency(), changes.location(), changes.travelTime())
                .allMatch(group -> group.create().isEmpty() && group.update().isEmpty() && group.destroy().isEmpty());
    }
}
