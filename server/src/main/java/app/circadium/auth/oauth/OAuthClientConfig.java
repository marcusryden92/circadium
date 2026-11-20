package app.circadium.auth.oauth;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

@Slf4j
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(OAuthProperties.class)
class OAuthClientConfig {

    static final String GOOGLE = "google";

    /**
     * Google when its credentials are set. Without them only {@code local} starts, with Google sign-in switched
     * off; every other profile refuses to start, so a deployment cannot silently lose it.
     */
    @Bean
    ClientRegistrationRepository clientRegistrationRepository(OAuthProperties properties, Environment environment) {
        if (properties.google().configured()) {
            return new InMemoryClientRegistrationRepository(googleRegistration(properties));
        }
        if (!environment.matchesProfiles("local")) {
            throw new IllegalStateException(
                    "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set. Google sign-in is required outside the "
                            + "local profile.");
        }
        log.warn("Google sign-in is disabled: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
        return registrationId -> null;
    }

    /**
     * Spring's Google preset supplies the endpoints, the issuer and the key set the ID token is verified
     * against. On top of it: PKCE even though this is a confidential client (the secret alone does not protect
     * an intercepted authorization code if the secret ever leaks), and the one redirect URI registered with Google.
     */
    static ClientRegistration googleRegistration(OAuthProperties properties) {
        return CommonOAuth2Provider.GOOGLE.getBuilder(GOOGLE)
                .clientId(properties.google().clientId())
                .clientSecret(properties.google().clientSecret())
                .redirectUri(properties.redirectBaseUrl() + "/login/oauth2/code/" + GOOGLE)
                .scope("openid", "email", "profile")
                .clientSettings(ClientRegistration.ClientSettings.builder().requireProofKey(true).build())
                .build();
    }
}
