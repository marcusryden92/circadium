package app.circadium.auth;

import app.circadium.persistence.repository.SessionRepository;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtAudienceValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({AuthProperties.class, AuthCookieProperties.class})
class JwtConfig {

    @Bean
    SigningKeys signingKeys(AuthProperties properties) {
        return SigningKeys.from(properties);
    }

    @Bean
    JwtEncoder jwtEncoder(SigningKeys signingKeys) {
        return new NimbusJwtEncoder(signingKeys.jwkSource());
    }

    /**
     * Verifies against the local key ring rather than fetching our own JWKS over HTTP; the published
     * endpoint exists for other verifiers (the Next middleware). Validators run only after the signature
     * verifies, so a forged token never reaches the session check's database query.
     */
    @Bean
    JwtDecoder jwtDecoder(SigningKeys signingKeys, AuthProperties properties, SessionRepository sessionRepository) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSource(signingKeys.jwkSource())
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithValidators(
                        new JwtIssuerValidator(properties.issuer()),
                        new JwtAudienceValidator(properties.audience())),
                new SessionFamilyValidator(sessionRepository)));
        return decoder;
    }
}
