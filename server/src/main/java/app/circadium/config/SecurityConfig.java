package app.circadium.config;

import static org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.pathPattern;

import app.circadium.auth.AuthCookies;
import app.circadium.auth.CookieBearerTokenResolver;
import app.circadium.auth.oauth.OAuthClientConfig;
import app.circadium.auth.oauth.OAuthLoginHandler;
import app.circadium.auth.oauth.OAuthStartFilter;
import app.circadium.auth.oauth.SignInAuthorizedClients;
import java.util.Arrays;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.header.writers.DelegatingRequestMatcherHeaderWriter;
import org.springframework.security.web.header.writers.StaticHeadersWriter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.NegatedRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * Two filter chains. The OAuth chain handles only provider sign-in's start and callback; everything else is the
 * stateless token API, which takes the access token from the {@code Authorization} header (mobile) or the access
 * cookie (web).
 *
 * <p>Spring's CSRF tokens are off on both. A bearer header is never attached by a browser on its own. Requests
 * authenticated by cookie are covered by SameSite plus {@link CorsConfig}, which refuses any request from an origin
 * other than the web app's before it reaches this chain. The OAuth endpoints are browser navigations (Apple's callback
 * a cross-site form POST, which CORS lets through) whose callback is protected by {@code state}.
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfig {

    private static final String[] API_DOCS = {"/v3/api-docs", "/v3/api-docs/**", "/swagger-ui.html", "/swagger-ui/**"};

    /**
     * The API serves JSON, which a browser should never run, style, or frame. Swagger UI is an HTML page and is
     * left without it.
     */
    private static final String API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'";

    /** Endpoints anyone may call. The token resolver never reads the access cookie on these. */
    static final RequestMatcher PUBLIC_ENDPOINTS = new OrRequestMatcher(
            pathPattern("/actuator/health"),
            pathPattern("/actuator/health/**"),
            pathPattern("/actuator/info"),
            pathPattern("/error"),
            pathPattern(HttpMethod.GET, "/.well-known/jwks.json"),
            pathPattern(HttpMethod.POST, "/auth/register"),
            pathPattern(HttpMethod.POST, "/auth/login"),
            pathPattern(HttpMethod.POST, "/auth/2fa"),
            pathPattern(HttpMethod.POST, "/auth/refresh"),
            pathPattern(HttpMethod.POST, "/auth/logout"),
            pathPattern(HttpMethod.POST, "/auth/verify-email"),
            pathPattern(HttpMethod.POST, "/auth/password-reset"),
            pathPattern(HttpMethod.POST, "/auth/password-reset/confirm"),
            pathPattern(HttpMethod.POST, "/auth/handoff"),
            pathPattern(HttpMethod.POST, "/auth/oauth/confirm"));

    /**
     * Provider sign-in, the only part of the API with server-side state: Spring keeps {@code state}, the PKCE
     * verifier and the nonce in a session for the round trip to the provider, and the handler ends that session on
     * the callback. Nothing here authenticates later requests; a sign-in ends in a handoff code that
     * {@code POST /auth/handoff} exchanges for ordinary bearer tokens.
     */
    @Bean
    @Order(1)
    SecurityFilterChain oauthLoginFilterChain(HttpSecurity http, ClientRegistrationRepository registrations,
            OAuthLoginHandler handler,
            OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> signInTokenClient) throws Exception {
        DefaultOAuth2AuthorizationRequestResolver authorizationRequests = new DefaultOAuth2AuthorizationRequestResolver(
                registrations, OAuth2AuthorizationRequestRedirectFilter.DEFAULT_AUTHORIZATION_REQUEST_BASE_URI);
        authorizationRequests.setAuthorizationRequestCustomizer(OAuthClientConfig::customizeAuthorizationRequest);
        http
                .securityMatcher("/oauth2/authorization/**", "/login/oauth2/code/**")
                .csrf(csrf -> csrf.disable())
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .requestCache(cache -> cache.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .securityContext(context -> context.securityContextRepository(
                        new RequestAttributeSecurityContextRepository()))
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                .addFilterBefore(new OAuthStartFilter(registrations), OAuth2AuthorizationRequestRedirectFilter.class)
                .oauth2Login(login -> login
                        .clientRegistrationRepository(registrations)
                        .authorizationEndpoint(endpoint -> endpoint.authorizationRequestResolver(authorizationRequests))
                        .tokenEndpoint(endpoint -> endpoint.accessTokenResponseClient(signInTokenClient))
                        .authorizedClientRepository(new SignInAuthorizedClients())
                        .securityContextRepository(new RequestAttributeSecurityContextRepository())
                        .successHandler(handler)
                        .failureHandler(handler));
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain apiSecurityFilterChain(HttpSecurity http, Environment environment, AuthCookies authCookies)
            throws Exception {
        boolean local = environment.matchesProfiles("local");
        RequestMatcher apiDocs = new OrRequestMatcher(Arrays.stream(API_DOCS)
                .map(PathPatternRequestMatcher::pathPattern)
                .toArray(RequestMatcher[]::new));
        http
                .csrf(csrf -> csrf.disable())
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .headers(headers -> headers.addHeaderWriter(new DelegatingRequestMatcherHeaderWriter(
                        new NegatedRequestMatcher(apiDocs),
                        new StaticHeadersWriter("Content-Security-Policy", API_CONTENT_SECURITY_POLICY))))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> {
                    authorize.requestMatchers(PUBLIC_ENDPOINTS).permitAll();
                    if (local) {
                        authorize.requestMatchers(API_DOCS).permitAll();
                    } else {
                        authorize.requestMatchers(API_DOCS).hasRole("ADMIN");
                    }
                    authorize.anyRequest().authenticated();
                })
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .bearerTokenResolver(new CookieBearerTokenResolver(authCookies, PUBLIC_ENDPOINTS))
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));
        return http.build();
    }

    /** Maps the token's {@code role} claim (USER / ADMIN) onto Spring's {@code ROLE_} authorities. */
    private static JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("role");
        authorities.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }
}
