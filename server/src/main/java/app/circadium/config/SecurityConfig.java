package app.circadium.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Stateless bearer-token API. CSRF is off because every endpoint authenticates by bearer token, which
 * browsers never attach automatically.
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfig {

    private static final String[] API_DOCS = {"/v3/api-docs", "/v3/api-docs/**", "/swagger-ui.html", "/swagger-ui/**"};

    @Bean
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
                            "/auth/verify-email", "/auth/password-reset", "/auth/password-reset/confirm").permitAll();
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
}
