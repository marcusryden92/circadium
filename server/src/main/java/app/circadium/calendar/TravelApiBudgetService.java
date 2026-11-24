package app.circadium.calendar;

import app.circadium.calendar.TravelRefreshPolicy.BudgetReservation;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.enums.TransportMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The transactional reservation against the account-global {@code TravelApiBudget} singleton row.
 * Committed BEFORE the Google call, so a failed call may overcount but never under; the
 * {@code FOR UPDATE} lock closes the race the Prisma version had, where two concurrent fetches
 * could both read the old count and slip under the cap together. The lock is never held across
 * the HTTP call — this method commits first.
 */
@Service
@RequiredArgsConstructor
public class TravelApiBudgetService {

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    /** Returns null when the elements were reserved, else the user-facing refusal reason. */
    @Transactional
    public String reserve(int pairCount, TransportMode mode) {
        Instant now = DbTime.now(clock);
        int planned = TravelRefreshPolicy.elementsForPairs(pairCount,
                TravelRefreshPolicy.isTimeVarying(mode));

        jdbcTemplate.update("INSERT INTO \"TravelApiBudget\" (\"id\", \"elementsThisMonth\","
                        + " \"periodStart\", \"updatedAt\") VALUES ('global', 0, ?, ?)"
                        + " ON CONFLICT (\"id\") DO NOTHING",
                DbTime.toDb(TravelRefreshPolicy.monthStartUtc(now)), DbTime.toDb(now));

        BudgetRow row = jdbcTemplate.queryForObject(
                "SELECT \"elementsThisMonth\", \"periodStart\" FROM \"TravelApiBudget\""
                        + " WHERE \"id\" = 'global' FOR UPDATE",
                (rs, rowNum) -> new BudgetRow(rs.getInt("elementsThisMonth"),
                        DbTime.fromDb(rs.getObject("periodStart", LocalDateTime.class))));

        BudgetReservation reservation = TravelRefreshPolicy.reserveElements(now, planned, row.count(),
                row.periodStart(), TravelRefreshPolicy.TRAVEL_ELEMENT_MONTHLY_CAP);
        if (!reservation.allowed()) {
            return reservation.reason();
        }
        jdbcTemplate.update("UPDATE \"TravelApiBudget\" SET \"elementsThisMonth\" = ?,"
                        + " \"periodStart\" = ?, \"updatedAt\" = ? WHERE \"id\" = 'global'",
                reservation.nextCount(), DbTime.toDb(reservation.periodStart()), DbTime.toDb(now));
        return null;
    }

    private record BudgetRow(int count, Instant periodStart) {
    }
}
