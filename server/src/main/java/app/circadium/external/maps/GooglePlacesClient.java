package app.circadium.external.maps;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriBuilder;

/**
 * Places API (New) over REST, the port of {@code lib/google-maps-api.ts}: autocomplete posts the
 * query with the same primary-type filter; details is Essentials-tier only
 * ({@code id,formattedAddress,location} — displayName is Pro), and passing the session token
 * closes the autocomplete billing session.
 */
public class GooglePlacesClient implements PlacesClient {

    private final RestClient restClient;
    private final MapsProperties properties;

    GooglePlacesClient(RestClient.Builder restClientBuilder, MapsProperties properties) {
        this.restClient = restClientBuilder.baseUrl(properties.placesBaseUrl()).build();
        this.properties = properties;
    }

    public static GooglePlacesClient create(MapsProperties properties) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
        requestFactory.setReadTimeout(Duration.ofSeconds(8));
        return new GooglePlacesClient(RestClient.builder().requestFactory(requestFactory), properties);
    }

    @Override
    public List<PlacePrediction> searchPlaces(String query, String sessionToken) {
        if (query == null || query.length() < 2) {
            return List.of();
        }
        requireKey();

        Map<String, Object> request = new HashMap<>();
        request.put("input", query);
        request.put("includedPrimaryTypes",
                List.of("street_address", "premise", "subpremise", "establishment"));
        if (sessionToken != null && !sessionToken.isBlank()) {
            request.put("sessionToken", sessionToken);
        }

        // No retry: autocomplete answers a keystroke, where a stale retry is worse than a miss.
        AutocompleteResponse response = restClient.post()
                .uri("/v1/places:autocomplete")
                .header("X-Goog-Api-Key", properties.apiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(AutocompleteResponse.class);

        if (response == null || response.suggestions() == null) {
            return List.of();
        }
        return response.suggestions().stream()
                .map(AutocompleteSuggestion::placePrediction)
                .filter(prediction -> prediction != null)
                .map(prediction -> new PlacePrediction(
                        prediction.placeId(),
                        prediction.text() == null ? "" : prediction.text().text(),
                        prediction.structuredFormat() != null && prediction.structuredFormat().mainText() != null
                                ? prediction.structuredFormat().mainText().text()
                                : (prediction.text() == null ? "" : prediction.text().text()),
                        prediction.structuredFormat() != null && prediction.structuredFormat().secondaryText() != null
                                ? prediction.structuredFormat().secondaryText().text()
                                : ""))
                .toList();
    }

    @Override
    public PlaceDetails placeDetails(String placeId, String sessionToken) {
        requireKey();

        PlaceDetailsResponse response = MapsHttp.withRetry(() -> restClient.get()
                .uri(builder -> {
                    UriBuilder uri = builder.path("/v1/places/{placeId}");
                    if (sessionToken != null && !sessionToken.isBlank()) {
                        uri = uri.queryParam("sessionToken", sessionToken);
                    }
                    return uri.build(placeId);
                })
                .header("X-Goog-Api-Key", properties.apiKey())
                .header("X-Goog-FieldMask", "id,formattedAddress,location")
                .retrieve()
                .body(PlaceDetailsResponse.class));

        if (response == null || response.location() == null) {
            throw new IllegalStateException("Place details response carried no location");
        }
        return new PlaceDetails(response.id(), response.formattedAddress(),
                response.location().latitude(), response.location().longitude());
    }

    private void requireKey() {
        if (!properties.configured()) {
            throw new MapsNotConfiguredException();
        }
    }

    record AutocompleteResponse(List<AutocompleteSuggestion> suggestions) {
    }

    record AutocompleteSuggestion(RawPrediction placePrediction) {
    }

    record RawPrediction(String placeId, RawText text, RawStructuredFormat structuredFormat) {
    }

    record RawText(String text) {
    }

    record RawStructuredFormat(RawText mainText, RawText secondaryText) {
    }

    record PlaceDetailsResponse(String id, String formattedAddress, RawLocation location) {
    }

    record RawLocation(double latitude, double longitude) {
    }
}
