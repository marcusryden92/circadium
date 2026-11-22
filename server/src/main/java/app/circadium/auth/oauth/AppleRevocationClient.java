package app.circadium.auth.oauth;

import io.sentry.Sentry;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Calls Apple's {@code /auth/revoke} with the stored refresh token and a freshly signed client secret.
 *
 * <p>Runs on a background thread so the deletion response never waits on Apple. Apple answers 200 even for a token
 * that is already invalid, so a revocation is safe to repeat and is retried on rate limiting, server errors and
 * network failures. One that still fails goes to the log and Sentry; the token itself is never logged.
 */
@Slf4j
public class AppleRevocationClient implements AppleTokenRevoker, AutoCloseable {

    static final String REVOKE_URL = "https://appleid.apple.com/auth/revoke";
    static final int MAX_ATTEMPTS = 3;

    private final RestClient restClient;
    private final String revokeUrl;
    private final AppleClientSecret clientSecret;
    private final Executor executor;
    private final Duration retryBackoff;

    AppleRevocationClient(RestClient restClient, String revokeUrl, AppleClientSecret clientSecret, Executor executor,
            Duration retryBackoff) {
        this.restClient = restClient;
        this.revokeUrl = revokeUrl;
        this.clientSecret = clientSecret;
        this.executor = executor;
        this.retryBackoff = retryBackoff;
    }

    static AppleRevocationClient create(AppleClientSecret clientSecret) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        requestFactory.setReadTimeout(Duration.ofSeconds(10));
        // Deletions are rare and spend their time waiting on the network, so a virtual thread each is enough.
        return new AppleRevocationClient(RestClient.builder().requestFactory(requestFactory).build(), REVOKE_URL,
                clientSecret, Executors.newVirtualThreadPerTaskExecutor(), Duration.ofSeconds(2));
    }

    @Override
    public void revoke(String refreshToken) {
        Map<String, String> context = MDC.getCopyOfContextMap();
        executor.execute(() -> {
            if (context != null) {
                MDC.setContextMap(context);
            }
            try {
                revokeNow(refreshToken);
            } finally {
                MDC.clear();
            }
        });
    }

    /** Waits for revocations already started, so a deploy does not drop one. */
    @Override
    public void close() {
        if (executor instanceof ExecutorService service) {
            service.close();
        }
    }

    void revokeNow(String refreshToken) {
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
                form.add("client_id", clientSecret.clientId());
                form.add("client_secret", clientSecret.create());
                form.add("token", refreshToken);
                form.add("token_type_hint", "refresh_token");
                restClient.post()
                        .uri(revokeUrl)
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .body(form)
                        .retrieve()
                        .toBodilessEntity();
                log.info("[apple] revoked a Sign in with Apple authorization");
                return;
            } catch (HttpClientErrorException.TooManyRequests | HttpServerErrorException | ResourceAccessException e) {
                if (attempt == MAX_ATTEMPTS) {
                    fail(attempt, e);
                    return;
                }
                log.warn("[apple] revocation attempt {} failed ({}); retrying", attempt, e.getMessage());
                if (!sleep(retryBackoff.multipliedBy(attempt))) {
                    return;
                }
            } catch (RestClientException e) {
                fail(attempt, e);
                return;
            }
        }
    }

    private static void fail(int attempts, Exception e) {
        log.error("[apple] Sign in with Apple authorization not revoked after {} attempt(s): {}",
                attempts, e.getMessage());
        Sentry.captureException(e);
    }

    private static boolean sleep(Duration duration) {
        try {
            Thread.sleep(duration);
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
