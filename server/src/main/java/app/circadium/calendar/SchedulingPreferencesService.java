package app.circadium.calendar;

import app.circadium.calendar.CalendarContracts.SchedulingPreferences;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.enums.TransportMode;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes the account-wide scheduling preferences, one row per user. Outside the sync diff: a preference
 * change never moves {@code users.dataVersion}.
 */
@Service
@RequiredArgsConstructor
public class SchedulingPreferencesService {

    /**
     * What an account reads with no preferences row. bufferTimeMinutes 5 deliberately differs from the
     * column default 10 that applies once any preference write creates the row — the retired TS action
     * behaved exactly so, and parity preserves it; normalizing the two defaults is post-cutover debt.
     */
    static final SchedulingPreferences MISSING_ROW_DEFAULTS =
            new SchedulingPreferences(5, TransportMode.DRIVING, 1);

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    /**
     * Upsert on userId, patching only the provided fields; a create takes the column defaults for the
     * rest (buffer 10, DRIVING, week start 1), as the Prisma upserts did. defaultTransportMode is not
     * writable here — its writes live with the locations surface (Group B).
     */
    @Transactional
    public SchedulingPreferences update(String userId, Integer bufferTimeMinutes, Integer weekStartDay) {
        StringBuilder columns = new StringBuilder("\"id\", \"userId\"");
        StringBuilder values = new StringBuilder("?, ?");
        StringBuilder set = new StringBuilder();
        List<Object> params = new ArrayList<>(List.of(UUID.randomUUID().toString(), userId));

        if (bufferTimeMinutes != null) {
            columns.append(", \"bufferTimeMinutes\"");
            values.append(", ?");
            params.add(bufferTimeMinutes);
            set.append("\"bufferTimeMinutes\" = EXCLUDED.\"bufferTimeMinutes\", ");
        }
        if (weekStartDay != null) {
            columns.append(", \"weekStartDay\"");
            values.append(", ?");
            params.add(weekStartDay);
            set.append("\"weekStartDay\" = EXCLUDED.\"weekStartDay\", ");
        }

        columns.append(", \"createdAt\", \"updatedAt\"");
        values.append(", ?, ?");
        LocalDateTime now = DbTime.toDb(DbTime.now(clock));
        params.add(now);
        params.add(now);
        set.append("\"updatedAt\" = EXCLUDED.\"updatedAt\"");

        return jdbcTemplate.queryForObject(
                "INSERT INTO \"UserSchedulingPreferences\" (" + columns + ") VALUES (" + values + ")"
                        + " ON CONFLICT (\"userId\") DO UPDATE SET " + set
                        + " RETURNING \"bufferTimeMinutes\", \"defaultTransportMode\", \"weekStartDay\"",
                (rs, rowNum) -> new SchedulingPreferences(rs.getInt("bufferTimeMinutes"),
                        TransportMode.valueOf(rs.getString("defaultTransportMode")), rs.getInt("weekStartDay")),
                params.toArray());
    }
}
