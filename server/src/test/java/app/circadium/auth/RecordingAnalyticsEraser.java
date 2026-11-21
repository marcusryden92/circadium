package app.circadium.auth;

import app.circadium.external.analytics.AnalyticsEraser;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** Captures erasure requests so tests can check a deletion asked for one. */
public class RecordingAnalyticsEraser implements AnalyticsEraser {

    private final List<String> erased = new CopyOnWriteArrayList<>();

    @Override
    public void erasePerson(String userId) {
        erased.add(userId);
    }

    public List<String> erased() {
        return List.copyOf(erased);
    }
}
