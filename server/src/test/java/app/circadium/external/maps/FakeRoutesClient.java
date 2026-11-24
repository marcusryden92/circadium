package app.circadium.external.maps;

import app.circadium.persistence.enums.TransportMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Programmable Routes stand-in. Routed pairs answer rush/regular/night as
 * {@code minutes}/{@code minutes+1}/{@code minutes+2}, so a swapped column shows up in asserts;
 * pairs listed in {@code unroutablePairs} (as {@code "fromId->toId"}) answer ZERO_RESULTS on every
 * condition.
 */
public class FakeRoutesClient implements RoutesClient {

    public volatile int minutes = 10;
    public final Set<String> unroutablePairs = ConcurrentHashMap.newKeySet();
    public final List<List<TravelPair>> calls = new CopyOnWriteArrayList<>();

    public void reset() {
        minutes = 10;
        unroutablePairs.clear();
        calls.clear();
    }

    @Override
    public List<TravelTimeBatchResult> computeTravelTimeMatrix(List<TravelPair> pairs, TransportMode mode) {
        calls.add(List.copyOf(pairs));
        List<TravelTimeBatchResult> results = new ArrayList<>();
        for (TravelPair pair : pairs) {
            String key = pair.from().id() + "->" + pair.to().id();
            if (unroutablePairs.contains(key)) {
                TravelTimeResult missing = new TravelTimeResult(0, 0, "ZERO_RESULTS");
                results.add(new TravelTimeBatchResult(pair.from().id(), pair.to().id(),
                        missing, missing, missing));
            } else {
                results.add(new TravelTimeBatchResult(pair.from().id(), pair.to().id(),
                        new TravelTimeResult(minutes, 1000, "OK"),
                        new TravelTimeResult(minutes + 1, 1000, "OK"),
                        new TravelTimeResult(minutes + 2, 1000, "OK")));
            }
        }
        return results;
    }
}
