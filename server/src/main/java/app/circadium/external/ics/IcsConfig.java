package app.circadium.external.ics;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class IcsConfig {

    @Bean
    IcsFeedFetcher icsFeedFetcher() {
        return new HttpIcsFeedFetcher();
    }
}
