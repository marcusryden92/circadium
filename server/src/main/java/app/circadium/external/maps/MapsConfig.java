package app.circadium.external.maps;

import java.time.Clock;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(MapsProperties.class)
class MapsConfig {

    @Bean
    PlacesClient placesClient(MapsProperties properties) {
        warnIfUnconfigured(properties);
        return GooglePlacesClient.create(properties);
    }

    @Bean
    RoutesClient routesClient(MapsProperties properties, Clock clock) {
        return GoogleRoutesClient.create(properties, clock);
    }

    private static void warnIfUnconfigured(MapsProperties properties) {
        if (!properties.configured()) {
            log.warn("GOOGLE_MAPS_API_KEY is not set; location search and travel times answer 503");
        }
    }
}
