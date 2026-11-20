package app.circadium.config;

import app.circadium.auth.oauth.OAuthLoginHandler;
import app.circadium.auth.oauth.OAuthStartFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;

/**
 * Two filter chains. The OAuth chain handles only Google sign-in's start and callback; everything else is the
 * stateless bearer-token API. CSRF is off on both: the API authenticates by bearer token, which browsers never
 * attach automatically, and the OAuth endpoints are GET navigations whose callback is protected by {@code state}.
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfig {

    private static final String[] API_DOCS = {"/v3/api-docs", "/v3/api-docs/**", "/swagger-ui.html", "/swagger-ui/**"};

    /**
     * Google sign-in, the only part of the API with server-side state: Spring keeps {@code state}, the PKCE
     * verifier and the nonce in a session for the round trip to Google, and the handler ends that session on the
     * callback. Nothing here authenticates later requests; a sign-in ends in a handoff code that
     * {@code POST /auth/handoff} exchanges for ordinary bearer tokens.
     */
    @Bean
    @Order(1)
    SecurityFilterChain oauthLoginFilterChain(HttpSecurity http, ClientRegistrationRepository registrations,
            OAuthLoginHandler handler) throws Exception {
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
                        .authorizedClientRepository(new DiscardingAuthorizedClientRepository())
                        .securityContextRepository(new RequestAttributeSecurityContextRepository())
                        .successHandler(handler)
                        .failureHandler(handler));
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain apiSecurityFilterChain(HttpSecurity http, Environment environment) throws Exception {
        boolean local = environment.matchesProfiles("local");
        http
                .csrf(csrf -> csrf.disable())
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> {
                    authorize.requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll();
                    authorize.requestMatchers(HttpMethod.GET, "/.well-known/jwks.json").permitAll();
                    authorize.requestMatchers(HttpMethod.POST,
                            "/auth/register", "/auth/login", "/auth/2fa", "/auth/refresh", "/auth/logout",
                            "/auth/verify-email", "/auth/password-reset", "/auth/password-reset/confirm",
                            "/auth/handoff").permitAll();
                    authorize.requestMatchers("/error").permitAll();
                    if (local) {
                        authorize.requestMatchers(API_DOCS).permitAll();
                    } else {
                        authorize.requestMatchers(API_DOCS).hasRole("ADMIN");
                    }
                    authorize.anyRequest().authenticated();
                })
                .oauth2ResourceServer(resourceServer -> resourceServer
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

    /**
     * Spring would otherwise keep every signed-in user's Google access token in memory for the life of the process.
     * Sign-in only needs the identity, so the token is dropped as soon as the callback is handled.
     */
    private static final class DiscardingAuthorizedClientRepository implements OAuth2AuthorizedClientRepository {

        @Override
        public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String clientRegistrationId,
                Authentication principal, HttpServletRequest request) {
            return null;
        }

        @Override
        public void saveAuthorizedClient(OAuth2AuthorizedClient authorizedClient, Authentication principal,
                HttpServletRequest request, HttpServletResponse response) {
        }

        @Override
        public void removeAuthorizedClient(String clientRegistrationId, Authentication principal,
                HttpServletRequest request, HttpServletResponse response) {
        }
    }
}
