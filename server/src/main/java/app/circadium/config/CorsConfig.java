package app.circadium.config;

import app.circadium.web.CorrelationIdFilter;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

/**
 * Lets the web app call the API from its own origin with credentials (the token cookies), and nobody else.
 *
 * <p>This is also the CSRF defence for cookie-authenticated requests. Spring refuses with 403 every request whose
 * {@code Origin} is not on the list, not only preflights, and browsers send {@code Origin} on every cross-origin
 * request except a plain GET. So a page on another site, or on a sibling subdomain (which SameSite counts as the
 * same site), cannot make a signed-in browser change anything. GET endpoints must therefore have no side effects.
 *
 * <p>It runs as a servlet filter after the correlation id and before the rate limiter and Spring Security, rather
 * than inside the security chain, so that every response the web app can receive, a 429 or a 401 included,
 * carries the headers it needs to read it.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CorsProperties.class)
class CorsConfig {

    static final int ORDER = Ordered.HIGHEST_PRECEDENCE + 5;

    @Bean
    FilterRegistrationBean<CorsFilter> corsFilter(CorsProperties properties) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(properties.allowedOrigins());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE"));
        cors.setAllowedHeaders(List.of(HttpHeaders.CONTENT_TYPE, CorrelationIdFilter.REQUEST_ID_HEADER));
        cors.setExposedHeaders(List.of(HttpHeaders.RETRY_AFTER, CorrelationIdFilter.REQUEST_ID_HEADER));
        cors.setAllowCredentials(true);
        cors.setMaxAge(Duration.ofHours(1));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        FilterRegistrationBean<CorsFilter> registration = new FilterRegistrationBean<>(new CorsFilter(source));
        registration.setOrder(ORDER);
        return registration;
    }
}
