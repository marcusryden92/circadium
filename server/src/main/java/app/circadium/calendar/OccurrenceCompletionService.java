package app.circadium.calendar;

import static app.circadium.calendar.CalendarContracts.iso;

import app.circadium.auth.AccountFlowException;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.repository.OccurrenceCompletionRepository;
import app.circadium.persistence.repository.PlannerRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The occurrence-completion log: one row per completed occurrence of a recurring task/goal leaf, or per
 * checked-off plan occurrence, keyed by (plannerId, occurrenceKey). Deliberately outside the sync diff —
 * logging a completion never moves {@code users.dataVersion} or contends with the calendar transaction.
 */
@Service
@RequiredArgsConstructor
public class OccurrenceCompletionService {

    private final JdbcTemplate jdbcTemplate;
    private final OccurrenceCompletionRepository completionRepository;
    private final PlannerRepository plannerRepository;
    private final Clock clock;

    @Transactional(readOnly = true)
    public List<CalendarContracts.OccurrenceCompletion> list(String userId) {
        return completionRepository.findByUserIdOrderById(userId).stream()
                .map(c -> new CalendarContracts.OccurrenceCompletion(c.getId(), c.getPlannerId(), c.getUserId(),
                        c.getOccurrenceKey(), c.getStart(), c.getEnd(), iso(c.getCreatedAt())))
                .toList();
    }

    /**
     * Upsert on (plannerId, occurrenceKey): a re-log of the same occurrence moves only its window,
     * keeping the row's id and createdAt. The planner must be the caller's own; the composite unique
     * then guarantees a conflicting row is the caller's too.
     */
    @Transactional
    public CalendarContracts.OccurrenceCompletion log(String userId, String plannerId, String occurrenceKey,
            String start, String end) {
        if (!plannerRepository.existsByIdAndUserId(plannerId, userId)) {
            throw new AccountFlowException(HttpStatus.NOT_FOUND, "item_not_found", "This item does not exist.");
        }
        return jdbcTemplate.queryForObject("""
                        INSERT INTO "HabitCompletions"
                            ("id", "plannerId", "userId", "occurrenceKey", "start", "end", "createdAt")
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT ("plannerId", "occurrenceKey")
                        DO UPDATE SET "start" = EXCLUDED."start", "end" = EXCLUDED."end"
                        RETURNING "id", "plannerId", "userId", "occurrenceKey", "start", "end", "createdAt"
                        """,
                (rs, rowNum) -> new CalendarContracts.OccurrenceCompletion(rs.getString("id"),
                        rs.getString("plannerId"), rs.getString("userId"), rs.getString("occurrenceKey"),
                        rs.getString("start"), rs.getString("end"),
                        iso(DbTime.fromDb(rs.getObject("createdAt", LocalDateTime.class)))),
                UUID.randomUUID().toString(), plannerId, userId, occurrenceKey, start, end,
                DbTime.toDb(DbTime.now(clock)));
    }

    /** Scoped to the caller; a row that is missing or someone else's matches nothing rather than failing. */
    @Transactional
    public void unlog(String userId, String plannerId, String occurrenceKey) {
        jdbcTemplate.update(
                "DELETE FROM \"HabitCompletions\" WHERE \"userId\" = ? AND \"plannerId\" = ? AND \"occurrenceKey\" = ?",
                userId, plannerId, occurrenceKey);
    }
}
