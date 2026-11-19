package app.circadium.auth;

import static app.circadium.persistence.DbTime.fromDb;
import static app.circadium.persistence.DbTime.toDb;

import app.circadium.persistence.DbTime;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Per-identifier lockout with exponential backoff. Keyed by the normalized email whether or not an account
 * exists, so the lockout behaves identically for real and made-up addresses and cannot be used to discover
 * which emails are registered.
 */
@Component
@RequiredArgsConstructor
public class LoginThrottle {

    static final int FREE_ATTEMPTS = 4;
    static final Duration BASE_LOCK = Duration.ofMinutes(1);
    static final Duration MAX_LOCK = Duration.ofHours(1);
    static final Duration FAILURE_MEMORY = Duration.ofHours(24);

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    /** The remaining lock time, if the identifier is currently locked. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<Duration> remainingLock(String key) {
        List<LocalDateTime> rows = jdbcTemplate.queryForList(
                "select \"lockedUntil\" from auth_lockouts where \"key\" = ?", LocalDateTime.class, key);
        if (rows.isEmpty() || rows.getFirst() == null) {
            return Optional.empty();
        }
        Duration remaining = Duration.between(DbTime.now(clock), fromDb(rows.getFirst()));
        return remaining.isPositive() ? Optional.of(remaining) : Optional.empty();
    }

    /**
     * Counts one failure atomically (a single upsert, so concurrent failures cannot overwrite each other)
     * and returns the lock this failure imposed, if any. Failures older than {@link #FAILURE_MEMORY} are
     * forgotten so a typo months later does not resume an old escalation.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<Duration> recordFailure(String key) {
        Instant now = DbTime.now(clock);
        Integer attempts = jdbcTemplate.queryForObject("""
                insert into auth_lockouts ("key", "failedAttempts", "lastFailedAt", "lockedUntil")
                values (?, 1, ?, null)
                on conflict ("key") do update set
                    "failedAttempts" = case
                        when auth_lockouts."lastFailedAt" < ? then 1
                        else auth_lockouts."failedAttempts" + 1
                    end,
                    "lastFailedAt" = excluded."lastFailedAt"
                returning "failedAttempts"
                """, Integer.class, key, toDb(now), toDb(now.minus(FAILURE_MEMORY)));

        Optional<Duration> lock = lockDurationAfter(attempts);
        lock.ifPresent(duration -> jdbcTemplate.update(
                "update auth_lockouts set \"lockedUntil\" = ? where \"key\" = ?",
                toDb(now.plus(duration)), key));
        return lock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordSuccess(String key) {
        jdbcTemplate.update("delete from auth_lockouts where \"key\" = ?", key);
    }

    /** 1-4 failures: no lock. 5th: 1 minute, then doubling per failure, capped at 1 hour. */
    static Optional<Duration> lockDurationAfter(int failedAttempts) {
        if (failedAttempts <= FREE_ATTEMPTS) {
            return Optional.empty();
        }
        int doublings = Math.min(failedAttempts - FREE_ATTEMPTS - 1, 10);
        Duration lock = BASE_LOCK.multipliedBy(1L << doublings);
        return Optional.of(lock.compareTo(MAX_LOCK) > 0 ? MAX_LOCK : lock);
    }
}
