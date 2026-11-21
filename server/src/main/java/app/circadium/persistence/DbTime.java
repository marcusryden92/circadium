package app.circadium.persistence;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/**
 * The database time convention: {@code timestamp(3)} columns hold UTC wall-clock time at millisecond
 * precision. Hibernate applies it automatically ({@code hibernate.jdbc.time_zone: UTC}); code going through
 * {@code JdbcTemplate} must convert explicitly, because the JDBC driver would otherwise use the JVM's local
 * zone.
 */
public final class DbTime {

    private DbTime() {}

    /** Now, truncated to what a {@code timestamp(3)} column keeps, so a value read back equals the one written. */
    public static Instant now(Clock clock) {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    public static LocalDateTime toDb(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    public static Instant fromDb(LocalDateTime value) {
        return value.toInstant(ZoneOffset.UTC);
    }
}
