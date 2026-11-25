package app.circadium.external.microsoftgraph;

import app.circadium.auth.oauth.OAuthProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class MicrosoftGraphConfig {

    @Bean
    MicrosoftGraphClient microsoftGraphClient(OAuthProperties properties) {
        return MicrosoftGraphRestClient.create(properties);
    }
}
