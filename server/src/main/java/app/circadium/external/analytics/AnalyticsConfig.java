package app.circadium.external.analytics;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(PosthogProperties.class)
class AnalyticsConfig {

    /**
     * PostHog when it is configured. Unlike mail this is optional in every profile: an environment whose web
     * app sends no analytics has nothing to erase.
     */
    @Bean
    AnalyticsEraser analyticsEraser(PosthogProperties properties) {
        if (properties.configured()) {
            return PosthogAnalyticsEraser.create(properties);
        }
        log.warn("POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID is not set: account deletion will not erase "
                + "the PostHog person.");
        return userId -> {};
    }
}
