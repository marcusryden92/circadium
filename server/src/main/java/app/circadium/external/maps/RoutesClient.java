package app.circadium.external.maps;

import app.circadium.persistence.enums.TransportMode;
import java.util.List;

/**
 * Routes API computeRouteMatrix across the three time-of-day conditions. Pairs are billed per
 * element, so implementations must group by origin and never request the diagonal.
 */
public interface RoutesClient {

    List<TravelTimeBatchResult> computeTravelTimeMatrix(List<TravelPair> pairs, TransportMode mode);

    record TravelPoint(String id, double lat, double lng) {
    }

    record TravelPair(TravelPoint from, TravelPoint to) {
    }

    /** One condition's answer; {@code OK} is the only status whose minutes mean anything. */
    record TravelTimeResult(int durationMinutes, int distanceMeters, String status) {

        public boolean routed() {
            return "OK".equals(status);
        }
    }

    record TravelTimeBatchResult(String fromLocationId, String toLocationId,
            TravelTimeResult rushHour, TravelTimeResult regular, TravelTimeResult night) {

        /** The TS writer's allConditionsRouted: a row is stored as routable only when all three answered. */
        public boolean allConditionsRouted() {
            return rushHour.routed() && regular.routed() && night.routed();
        }
    }
}
