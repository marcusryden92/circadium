package app.circadium.auth.oauth;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.converter.FormHttpMessageConverter;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.endpoint.RestClientAuthorizationCodeTokenResponseClient;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenDecoderFactory;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenValidator;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;
import org.springframework.security.oauth2.core.http.converter.OAuth2AccessTokenResponseHttpMessageConverter;
import org.springframework.security.oauth2.core.oidc.IdTokenClaimNames;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoderFactory;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.web.client.RestClient;

@Slf4j
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(OAuthProperties.class)
public class OAuthClientConfig {

    /** Spring keeps provider metadata on the registration; this is where the Microsoft issuer template lives. */
    static final String ISSUER_METADATA = "issuer";

    static final String MICROSOFT_ISSUER_TEMPLATE =
            "https://login.microsoftonline.com/" + MicrosoftIssuerValidator.TENANT_PLACEHOLDER + "/v2.0";

    /**
     * The providers listed in {@code circadium.oauth.providers}. Outside {@code local} a listed provider without
     * credentials stops startup; {@code local} switches it off with a warning, so the API runs with none set up.
     */
    @Bean
    ClientRegistrationRepository clientRegistrationRepository(OAuthProperties properties, Environment environment) {
        boolean local = environment.matchesProfiles("local");
        List<ClientRegistration> registrations = new ArrayList<>();
        for (SignInProvider provider : listedProviders(properties)) {
            if (properties.configured(provider)) {
                registrations.add(registration(provider, properties));
            } else if (local) {
                log.warn("{} sign-in is disabled: {} are not set", provider.displayName(),
                        OAuthProperties.requiredVariables(provider));
            } else {
                throw new IllegalStateException("%s sign-in is listed in OAUTH_PROVIDERS, but %s are not set."
                        .formatted(provider.displayName(), OAuthProperties.requiredVariables(provider)));
            }
        }
        if (registrations.isEmpty()) {
            return registrationId -> null;
        }
        return new InMemoryClientRegistrationRepository(registrations);
    }

    static Set<SignInProvider> listedProviders(OAuthProperties properties) {
        Set<SignInProvider> listed = new LinkedHashSet<>();
        for (String name : properties.providers()) {
            String trimmed = name.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            listed.add(SignInProvider.fromRegistrationId(trimmed).orElseThrow(() -> new IllegalStateException(
                    "OAUTH_PROVIDERS names an unknown provider '%s'; known: %s"
                            .formatted(trimmed, SignInProvider.registrationIds()))));
        }
        return listed;
    }

    static ClientRegistration registration(SignInProvider provider, OAuthProperties properties) {
        return switch (provider) {
            case GOOGLE -> googleRegistration(properties);
            case MICROSOFT -> microsoftRegistration(properties);
            case APPLE -> appleRegistration(properties);
        };
    }

    /**
     * Spring's Google preset supplies the endpoints, the issuer and the key set the ID token is verified
     * against. On top of it: PKCE even though this is a confidential client (the secret alone does not protect
     * an intercepted authorization code if the secret ever leaks), and the one redirect URI registered with Google.
     */
    static ClientRegistration googleRegistration(OAuthProperties properties) {
        return CommonOAuth2Provider.GOOGLE.getBuilder(SignInProvider.GOOGLE.registrationId())
                .clientId(properties.google().clientId())
                .clientSecret(properties.google().clientSecret())
                .redirectUri(callbackUri(properties, SignInProvider.GOOGLE))
                .scope("openid", "email", "profile")
                .clientSettings(ClientRegistration.ClientSettings.builder().requireProofKey(true).build())
                .build();
    }

    /**
     * The multi-tenant {@code common} endpoints, so personal and work or school accounts both work. There is no
     * issuer URI on purpose: Microsoft's issuer names the user's tenant, so {@link MicrosoftIssuerValidator}
     * checks it against the template kept in the metadata. PKCE as for Google. No user-info endpoint: everything
     * sign-in reads is in the ID token.
     */
    static ClientRegistration microsoftRegistration(OAuthProperties properties) {
        String base = "https://login.microsoftonline.com/common";
        return ClientRegistration.withRegistrationId(SignInProvider.MICROSOFT.registrationId())
                .clientName(SignInProvider.MICROSOFT.displayName())
                .clientId(properties.microsoft().clientId())
                .clientSecret(properties.microsoft().clientSecret())
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri(callbackUri(properties, SignInProvider.MICROSOFT))
                .scope("openid", "email", "profile")
                .authorizationUri(base + "/oauth2/v2.0/authorize")
                .tokenUri(base + "/oauth2/v2.0/token")
                .jwkSetUri(base + "/discovery/v2.0/keys")
                .providerConfigurationMetadata(Map.of(ISSUER_METADATA, MICROSOFT_ISSUER_TEMPLATE))
                .userNameAttributeName(IdTokenClaimNames.SUB)
                .clientSettings(ClientRegistration.ClientSettings.builder().requireProofKey(true).build())
                .build();
    }

    /**
     * The client secret here is a placeholder: {@link #signInTokenClient} swaps in a freshly signed
     * {@link AppleClientSecret} on every token request. PKCE is switched off (Spring 7 turns it on by default):
     * Apple's authorize and token endpoints document no PKCE parameters, and sending ones Apple may one day reject
     * would break sign-in for no gain, because the ID token's nonce already binds the code to this browser's
     * session. No user-info endpoint: Apple has none, and the name arrives in the callback form instead.
     */
    static ClientRegistration appleRegistration(OAuthProperties properties) {
        return ClientRegistration.withRegistrationId(SignInProvider.APPLE.registrationId())
                .clientName(SignInProvider.APPLE.displayName())
                .clientId(properties.apple().clientId())
                .clientSecret("signed-per-request")
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri(callbackUri(properties, SignInProvider.APPLE))
                .scope("openid", "email", "name")
                .authorizationUri("https://appleid.apple.com/auth/authorize")
                .tokenUri("https://appleid.apple.com/auth/token")
                .jwkSetUri("https://appleid.apple.com/auth/keys")
                .issuerUri(AppleClientSecret.AUDIENCE)
                .userNameAttributeName(IdTokenClaimNames.SUB)
                .clientSettings(ClientRegistration.ClientSettings.builder().requireProofKey(false).build())
                .build();
    }

    static String callbackUri(OAuthProperties properties, SignInProvider provider) {
        return properties.redirectBaseUrl() + "/login/oauth2/code/" + provider.registrationId();
    }

    /**
     * Verifies every provider's ID token the standard way (signature against the provider's key set, issuer
     * where it is fixed, audience, nonce, times), plus the tenant-aware issuer check for Microsoft.
     */
    @Bean
    JwtDecoderFactory<ClientRegistration> idTokenDecoderFactory() {
        OidcIdTokenDecoderFactory factory = new OidcIdTokenDecoderFactory();
        factory.setJwtValidatorFactory(registration -> {
            OAuth2TokenValidator<Jwt> standard =
                    new DelegatingOAuth2TokenValidator<>(new JwtTimestampValidator(), new OidcIdTokenValidator(registration));
            if (!SignInProvider.MICROSOFT.registrationId().equals(registration.getRegistrationId())) {
                return standard;
            }
            Object template = registration.getProviderDetails().getConfigurationMetadata().get(ISSUER_METADATA);
            return new DelegatingOAuth2TokenValidator<>(standard, new MicrosoftIssuerValidator((String) template));
        });
        return factory;
    }

    /** Without Apple sign-in configured there is no Apple authorization to revoke. */
    @Bean
    AppleTokenRevoker appleTokenRevoker(AppleClientSecret appleSecret) {
        return appleSecret.configured() ? AppleRevocationClient.create(appleSecret) : refreshToken -> {};
    }

    /**
     * Spring's token client, with Apple's signed secret put in place of the registration's placeholder, and
     * {@link TokenErrorResponseHandler} so a refused token request logs the provider's reason.
     */
    @Bean
    OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> signInTokenClient(
            AppleClientSecret appleSecret) {
        RestClientAuthorizationCodeTokenResponseClient client = new RestClientAuthorizationCodeTokenResponseClient();
        client.setRestClient(tokenRestClient(RestClient.builder()));
        client.setParametersCustomizer(parameters -> {
            if (appleSecret.configured()
                    && appleSecret.clientId().equals(parameters.getFirst(OAuth2ParameterNames.CLIENT_ID))) {
                parameters.set(OAuth2ParameterNames.CLIENT_SECRET, appleSecret.create());
            }
        });
        return client;
    }

    /**
     * The same message converters as the client Spring builds by default (a form for the request, its token response
     * reader for the answer); only the error handler differs. Takes the builder so tests can bind a mock server to it.
     */
    static RestClient tokenRestClient(RestClient.Builder builder) {
        return builder
                .configureMessageConverters(converters -> converters
                        .addCustomConverter(new FormHttpMessageConverter())
                        .addCustomConverter(new OAuth2AccessTokenResponseHttpMessageConverter()))
                .defaultStatusHandler(new TokenErrorResponseHandler())
                .build();
    }

    /**
     * Apple answers with an HTTP POST ({@code form_post}), which it requires whenever the name or email is
     * requested. Microsoft is asked to show its account picker, since people often hold both a personal and a
     * work account and would otherwise be signed in silently with whichever one the browser used last.
     */
    public static void customizeAuthorizationRequest(OAuth2AuthorizationRequest.Builder builder) {
        AtomicReference<Object> registrationId = new AtomicReference<>();
        builder.attributes(attributes -> registrationId.set(attributes.get(OAuth2ParameterNames.REGISTRATION_ID)));
        if (SignInProvider.APPLE.registrationId().equals(registrationId.get())) {
            builder.additionalParameters(parameters -> parameters.put("response_mode", "form_post"));
        } else if (SignInProvider.MICROSOFT.registrationId().equals(registrationId.get())) {
            builder.additionalParameters(parameters -> parameters.put("prompt", "select_account"));
        }
    }
}
