package app.circadium.external.maps;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/** Programmable Places stand-in so no test reaches Google; tests autowire it and seed details. */
public class FakePlacesClient implements PlacesClient {

    public final Map<String, PlaceDetails> detailsByPlaceId = new ConcurrentHashMap<>();
    public final List<PlacePrediction> predictions = new CopyOnWriteArrayList<>();
    public final AtomicInteger searchCalls = new AtomicInteger();
    public final AtomicInteger detailsCalls = new AtomicInteger();

    public void reset() {
        detailsByPlaceId.clear();
        predictions.clear();
        searchCalls.set(0);
        detailsCalls.set(0);
    }

    @Override
    public List<PlacePrediction> searchPlaces(String query, String sessionToken) {
        searchCalls.incrementAndGet();
        return List.copyOf(predictions);
    }

    @Override
    public PlaceDetails placeDetails(String placeId, String sessionToken) {
        detailsCalls.incrementAndGet();
        PlaceDetails details = detailsByPlaceId.get(placeId);
        if (details == null) {
            throw new IllegalStateException("No fake place details seeded for " + placeId);
        }
        return details;
    }
}
