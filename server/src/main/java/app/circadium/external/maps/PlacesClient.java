package app.circadium.external.maps;

import java.util.List;

/**
 * Places API (New): autocomplete and place details. The session token threads an autocomplete
 * burst and its closing details call into one billing session.
 */
public interface PlacesClient {

    List<PlacePrediction> searchPlaces(String query, String sessionToken);

    PlaceDetails placeDetails(String placeId, String sessionToken);

    record PlacePrediction(String placeId, String description, String mainText, String secondaryText) {
    }

    record PlaceDetails(String placeId, String formattedAddress, double lat, double lng) {
    }
}
