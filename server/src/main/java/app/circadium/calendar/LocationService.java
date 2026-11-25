package app.circadium.calendar;

import app.circadium.auth.AccountFlowException;
import app.circadium.calendar.CalendarContracts.SerializedLocation;
import app.circadium.external.maps.PlacesClient;
import app.circadium.external.maps.PlacesClient.PlaceDetails;
import app.circadium.external.maps.PlacesClient.PlacePrediction;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.Location;
import app.circadium.persistence.repository.LocationRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The location surface's server-first writes: creation and place changes need a Google Places
 * lookup and a server-minted id, so they cannot ride the sync diff (name edits and deletes do).
 * None of this moves {@code users.dataVersion}.
 */
@Service
@RequiredArgsConstructor
public class LocationService {

    private static final int SEARCH_LIMIT = 30;
    private static final long SEARCH_WINDOW_MS = 60_000;

    private final LocationRepository locationRepository;
    private final PlacesClient placesClient;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    /** Per-user autocomplete throttle; in-memory, single-instance like the auth rate limiter. */
    private final Map<String, SearchWindow> searchWindows = new ConcurrentHashMap<>();

    public List<PlacePrediction> search(String userId, String query, String sessionToken) {
        assertSearchAllowed(userId);
        return placesClient.searchPlaces(query, sessionToken);
    }

    public SerializedLocation create(String userId, String name, String placeId, String sessionToken) {
        if (locationRepository.countByUserId(userId) >= TravelRefreshPolicy.MAX_LOCATIONS) {
            throw new AccountFlowException(HttpStatus.CONFLICT, "location_limit",
                    "Maximum of " + TravelRefreshPolicy.MAX_LOCATIONS + " locations allowed");
        }
        if (locationRepository.findByUserIdAndPlaceId(userId, placeId).isPresent()) {
            throw new AccountFlowException(HttpStatus.CONFLICT, "duplicate_place",
                    "This location has already been added");
        }

        PlaceDetails details = placesClient.placeDetails(placeId, sessionToken);

        Instant now = DbTime.now(clock);
        Location location = new Location();
        location.setId(UUID.randomUUID().toString());
        location.setName(name);
        location.setAddress(details.formattedAddress());
        location.setPlaceId(placeId);
        location.setLat(details.lat());
        location.setLng(details.lng());
        location.setUserId(userId);
        location.setCreatedAt(now);
        location.setUpdatedAt(now);
        locationRepository.save(location);
        return CalendarBootstrapService.toWire(location);
    }

    public SerializedLocation update(String userId, String locationId, String name, String placeId,
            String sessionToken) {
        Location location = locationRepository.findByIdAndUserId(locationId, userId)
                .orElseThrow(() -> new AccountFlowException(HttpStatus.NOT_FOUND, "location_not_found",
                        "Location not found"));

        boolean placeChanged = placeId != null && !placeId.equals(location.getPlaceId());
        if (placeChanged) {
            Optional<Location> existing = locationRepository.findByUserIdAndPlaceId(userId, placeId);
            if (existing.isPresent() && !existing.get().getId().equals(locationId)) {
                throw new AccountFlowException(HttpStatus.CONFLICT, "duplicate_place",
                        "Another location already uses this place");
            }
            PlaceDetails details = placesClient.placeDetails(placeId, sessionToken);
            location.setPlaceId(placeId);
            location.setAddress(details.formattedAddress());
            location.setLat(details.lat());
            location.setLng(details.lng());
        }
        if (name != null) {
            location.setName(name);
        }
        location.setUpdatedAt(DbTime.now(clock));
        locationRepository.save(location);

        if (placeChanged) {
            // The cached matrix describes the old coordinates; dropping the rows re-buys on demand.
            jdbcTemplate.update("DELETE FROM \"TravelTimes\" WHERE \"fromLocationId\" = ?"
                    + " OR \"toLocationId\" = ?", locationId, locationId);
        }
        return CalendarBootstrapService.toWire(location);
    }

    private void assertSearchAllowed(String userId) {
        long now = clock.millis();
        SearchWindow window = searchWindows.compute(userId, (id, current) ->
                current == null || now >= current.resetAt()
                        ? new SearchWindow(1, now + SEARCH_WINDOW_MS)
                        : new SearchWindow(current.count() + 1, current.resetAt()));
        if (window.count() > SEARCH_LIMIT) {
            throw new AccountFlowException(HttpStatus.TOO_MANY_REQUESTS, "search_throttled",
                    "Too many address searches — wait a moment and try again.");
        }
    }

    private record SearchWindow(int count, long resetAt) {
    }
}
