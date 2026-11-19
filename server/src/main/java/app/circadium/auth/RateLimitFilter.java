package app.circadium.auth;

import app.circadium.web.CorrelationIdFilter;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Per-IP token buckets on the auth and emailed-link endpoints. This complements {@link LoginThrottle}: the
 * throttle stops guessing against one account from many IPs, this stops one IP from spraying many accounts.
 *
 * <p>Runs right after the correlation-id filter and before Spring Security, so a flood is refused before any
 * password hashing or database work. Buckets live in memory, which is correct for the single-instance
 * deployment; a second instance needs a shared (Postgres or Redis) bucket store.
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RateLimitFilter extends OncePerRequestFilter {

    enum Policy {
        LOGIN(10, Duration.ofMinutes(1)),
        REGISTER(5, Duration.ofHours(1)),
        PASSWORD_RESET(5, Duration.ofHours(1)),
        ACCOUNT_LINK(10, Duration.ofMinutes(1)),
        TOKEN(60, Duration.ofMinutes(1));

        final long capacity;
        final Duration period;

        Policy(long capacity, Duration period) {
            this.capacity = capacity;
            this.period = period;
        }
    }

    private static final Map<String, Policy> POLICIES = Map.of(
            "/auth/login", Policy.LOGIN,
            "/auth/2fa", Policy.LOGIN,
            "/auth/register", Policy.REGISTER,
            "/auth/password-reset", Policy.PASSWORD_RESET,
            "/auth/password-reset/confirm", Policy.ACCOUNT_LINK,
            "/auth/verify-email", Policy.ACCOUNT_LINK,
            "/account/deletion", Policy.ACCOUNT_LINK,
            "/account/deletion/confirm", Policy.ACCOUNT_LINK,
            "/auth/refresh", Policy.TOKEN,
            "/auth/logout", Policy.TOKEN);

    private final Cache<String, Bucket> buckets = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofHours(2))
            .maximumSize(100_000)
            .build();

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !POLICIES.containsKey(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Policy policy = POLICIES.get(request.getRequestURI());
        Bucket bucket = buckets.get(policy.name() + "|" + request.getRemoteAddr(), key -> newBucket(policy));
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            chain.doFilter(request, response);
            return;
        }
        long retryAfterSeconds = TooManyAttemptsException.retryAfterSeconds(
                Duration.ofNanos(probe.getNanosToWaitForRefill()));
        log.warn("Rate limit {} hit by {}", policy, request.getRemoteAddr());
        reject(request, response, retryAfterSeconds);
    }

    private static Bucket newBucket(Policy policy) {
        return Bucket.builder()
                .addLimit(limit -> limit.capacity(policy.capacity).refillGreedy(policy.capacity, policy.period))
                .build();
    }

    /**
     * Written by hand because this runs outside Spring MVC, where the ProblemDetail advice cannot reach.
     * Every interpolated value is a fixed string, a number, or a validated request id, so no escaping is needed.
     */
    private static void reject(HttpServletRequest request, HttpServletResponse response, long retryAfterSeconds)
            throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds));
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write("""
                {"title":"Too Many Requests","status":429,"detail":"Too many requests. Try again later.",\
                "instance":"%s","requestId":"%s"}""".formatted(request.getRequestURI(),
                MDC.get(CorrelationIdFilter.MDC_KEY)));
    }
}
