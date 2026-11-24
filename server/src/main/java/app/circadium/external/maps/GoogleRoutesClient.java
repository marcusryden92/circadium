package app.circadium.external.maps;

import app.circadium.persistence.enums.TransportMode;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Routes API computeRouteMatrix, the port of {@code lib/google-maps-api.ts}: pairs grouped by
 * origin so each request bills exactly the needed elements (never the diagonal); time-varying
 * modes (driving, transit) fetch rush-hour/regular/night separately while walking and cycling
 * fetch once and reuse it; departure times are next Monday 08:00/14:00/23:00 UTC (what the TS
 * computed as "local" on a UTC server). TRAFFIC_AWARE only rides DRIVE — invalid for TRANSIT.
 */
public class GoogleRoutesClient implements RoutesClient {

    private static final Map<TransportMode, String> TRANSPORT_MODE_MAP = Map.of(
            TransportMode.DRIVING, "DRIVE",
            TransportMode.TRANSIT, "TRANSIT",
            TransportMode.BICYCLING, "BICYCLE",
            TransportMode.WALKING, "WALK");

    private static final Set<TransportMode> TIME_VARYING_MODES =
            Set.of(TransportMode.DRIVING, TransportMode.TRANSIT);

    private final RestClient restClient;
    private final MapsProperties properties;
    private final Clock clock;

    GoogleRoutesClient(RestClient.Builder restClientBuilder, MapsProperties properties, Clock clock) {
        this.restClient = restClientBuilder.baseUrl(properties.routesBaseUrl()).build();
        this.properties = properties;
        this.clock = clock;
    }

    public static GoogleRoutesClient create(MapsProperties properties, Clock clock) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
        requestFactory.setReadTimeout(Duration.ofSeconds(15));
        return new GoogleRoutesClient(RestClient.builder().requestFactory(requestFactory), properties, clock);
    }

    @Override
    public List<TravelTimeBatchResult> computeTravelTimeMatrix(List<TravelPair> pairs, TransportMode mode) {
        if (!properties.configured()) {
            throw new MapsNotConfiguredException();
        }

        Map<String, OriginGroup> byOrigin = new LinkedHashMap<>();
        for (TravelPair pair : pairs) {
            if (pair.from().id().equals(pair.to().id())) {
                continue;
            }
            byOrigin.computeIfAbsent(pair.from().id(), id -> new OriginGroup(pair.from())).add(pair.to());
        }

        LocalDate nextMonday = nextMonday();
        boolean timeVarying = TIME_VARYING_MODES.contains(mode);

        List<TravelTimeBatchResult> results = new ArrayList<>();
        for (OriginGroup group : byOrigin.values()) {
            List<TravelTimeResult> rushHour;
            List<TravelTimeResult> regular;
            List<TravelTimeResult> night;
            if (timeVarying) {
                rushHour = computeMatrixRow(group, mode, nextMonday.atTime(LocalTime.of(8, 0)));
                regular = computeMatrixRow(group, mode, nextMonday.atTime(LocalTime.of(14, 0)));
                night = computeMatrixRow(group, mode, nextMonday.atTime(LocalTime.of(23, 0)));
            } else {
                rushHour = computeMatrixRow(group, mode, null);
                regular = rushHour;
                night = rushHour;
            }
            for (int i = 0; i < group.destinations.size(); i++) {
                results.add(new TravelTimeBatchResult(group.origin.id(), group.destinations.get(i).id(),
                        rushHour.get(i), regular.get(i), night.get(i)));
            }
        }
        return results;
    }

    /** The TS getDepartureTimes anchor: today is never "next Monday", a Monday rolls a full week. */
    private LocalDate nextMonday() {
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
        int days = (8 - today.getDayOfWeek().getValue()) % 7;
        return today.plusDays(days == 0 ? 7 : days);
    }

    private List<TravelTimeResult> computeMatrixRow(OriginGroup group, TransportMode mode,
            LocalDateTime departureUtc) {
        Map<String, Object> request = new HashMap<>();
        request.put("origins", List.of(waypoint(group.origin)));
        request.put("destinations", group.destinations.stream().map(GoogleRoutesClient::waypoint).toList());
        request.put("travelMode", TRANSPORT_MODE_MAP.get(mode));
        if (mode == TransportMode.DRIVING) {
            request.put("routingPreference", "TRAFFIC_AWARE");
        }
        if (departureUtc != null) {
            request.put("departureTime", departureUtc.atOffset(ZoneOffset.UTC).toInstant().toString());
        }

        RouteMatrixElement[] elements = MapsHttp.withRetry(() -> restClient.post()
                .uri("/distanceMatrix/v2:computeRouteMatrix")
                .header("X-Goog-Api-Key", properties.apiKey())
                .header("X-Goog-FieldMask",
                        "originIndex,destinationIndex,duration,distanceMeters,status,condition")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(RouteMatrixElement[].class));

        Map<Integer, RouteMatrixElement> byDestination = new HashMap<>();
        if (elements != null) {
            for (RouteMatrixElement element : elements) {
                byDestination.put(element.destinationIndex() == null ? 0 : element.destinationIndex(), element);
            }
        }
        List<TravelTimeResult> row = new ArrayList<>();
        for (int i = 0; i < group.destinations.size(); i++) {
            row.add(parseElement(byDestination.get(i)));
        }
        return row;
    }

    static TravelTimeResult parseElement(RouteMatrixElement element) {
        if (element == null
                || (element.status() != null && element.status().code() != null && element.status().code() != 0)) {
            return new TravelTimeResult(0, 0, "ERROR");
        }
        if (!"ROUTE_EXISTS".equals(element.condition())) {
            return new TravelTimeResult(0, 0, "ZERO_RESULTS");
        }
        long seconds = parseSeconds(element.duration());
        return new TravelTimeResult((int) Math.ceil(seconds / 60.0),
                element.distanceMeters() == null ? 0 : element.distanceMeters(), "OK");
    }

    /** The wire duration is {@code "123s"}. */
    private static long parseSeconds(String duration) {
        if (duration == null || duration.isEmpty()) {
            return 0;
        }
        String digits = duration.replaceAll("[^0-9]", "");
        return digits.isEmpty() ? 0 : Long.parseLong(digits);
    }

    private static Map<String, Object> waypoint(TravelPoint point) {
        return Map.of("waypoint", Map.of("location",
                Map.of("latLng", Map.of("latitude", point.lat(), "longitude", point.lng()))));
    }

    private static final class OriginGroup {

        final TravelPoint origin;
        final List<TravelPoint> destinations = new ArrayList<>();

        OriginGroup(TravelPoint origin) {
            this.origin = origin;
        }

        void add(TravelPoint destination) {
            if (destinations.stream().noneMatch(d -> d.id().equals(destination.id()))) {
                destinations.add(destination);
            }
        }
    }

    record RouteMatrixElement(Integer originIndex, Integer destinationIndex, RpcStatus status,
            String condition, Integer distanceMeters, String duration) {
    }

    record RpcStatus(Integer code, String message) {
    }
}
