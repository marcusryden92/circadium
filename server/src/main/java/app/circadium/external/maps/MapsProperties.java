package app.circadium.external.maps;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Google Maps Platform settings. The key is optional in every profile (the PostHog precedent):
 * absent, the clients throw {@link MapsNotConfiguredException} at call time, so a deploy is never
 * coupled to the secret being set first.
 *
 * @param apiKey one key for Places (New) and Routes, sent as {@code X-Goog-Api-Key}
 * @param placesBaseUrl the Places API origin
 * @param routesBaseUrl the Routes API origin
 */
@ConfigurationProperties("circadium.maps")
public record MapsProperties(String apiKey, String placesBaseUrl, String routesBaseUrl) {

    public MapsProperties {
        if (placesBaseUrl == null || placesBaseUrl.isBlank()) {
            placesBaseUrl = "https://places.googleapis.com";
        }
        if (routesBaseUrl == null || routesBaseUrl.isBlank()) {
            routesBaseUrl = "https://routes.googleapis.com";
        }
    }

    public boolean configured() {
        return apiKey != null && !apiKey.isBlank();
    }
}
