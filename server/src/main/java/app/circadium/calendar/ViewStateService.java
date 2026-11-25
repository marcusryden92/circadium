package app.circadium.calendar;

import app.circadium.calendar.ViewStateController.SaveViewStateRequest;
import app.circadium.calendar.ViewStateController.ViewStateResponse;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.repository.UserViewStateRepository;
import java.time.Clock;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The graph/mindmap canvas view preferences: one row per user, each canvas's serialized blob in its own
 * column, patched independently so the two canvases never clobber each other. The blobs are opaque here —
 * the client defines and defensively parses them. Outside the sync diff, like the occurrence log.
 */
@Service
@RequiredArgsConstructor
public class ViewStateService {

    private final JdbcTemplate jdbcTemplate;
    private final UserViewStateRepository viewStateRepository;
    private final Clock clock;

    @Transactional(readOnly = true)
    public ViewStateResponse get(String userId) {
        return viewStateRepository.findByUserId(userId)
                .map(row -> new ViewStateResponse(row.getGraph(), row.getMindmap()))
                .orElseGet(() -> new ViewStateResponse(null, null));
    }

    @Transactional
    public void save(String userId, SaveViewStateRequest.Kind kind, String state) {
        // The column name comes from the validated enum, never from raw request text. updatedAt has no
        // DB trigger on this table (it predates 1.13b's calendar set), so the writer stamps it.
        String column = "\"" + kind.name() + "\"";
        jdbcTemplate.update("INSERT INTO \"UserViewStates\" (\"id\", \"userId\", " + column + ", \"updatedAt\")"
                        + " VALUES (?, ?, ?, ?) ON CONFLICT (\"userId\") DO UPDATE SET "
                        + column + " = EXCLUDED." + column + ", \"updatedAt\" = EXCLUDED.\"updatedAt\"",
                UUID.randomUUID().toString(), userId, state, DbTime.toDb(DbTime.now(clock)));
    }
}
