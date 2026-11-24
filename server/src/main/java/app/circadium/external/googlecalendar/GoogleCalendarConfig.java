package app.circadium.external.googlecalendar;

import app.circadium.auth.oauth.OAuthProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class GoogleCalendarConfig {

    @Bean
    GoogleCalendarClient googleCalendarClient(OAuthProperties properties) {
        return GoogleCalendarRestClient.create(properties);
    }
}
