package app.circadium.external.analytics;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.sentry.Sentry;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Erases a PostHog person through PostHog's private API: look the person up by distinct id (the web app
 * identifies users by their user id), then delete each match with its events.
 *
 * <p>Runs on a background thread so the deletion response never waits on PostHog. Both calls are idempotent
 * (a person already deleted answers 404, which counts as done), so the whole erasure is retried on rate
 * limiting, server errors and network failures. One that still fails is logged and sent to Sentry with the
 * user id, which is all a manual erasure needs.
 */
@Slf4j
public class PosthogAnalyticsEraser implements AnalyticsEraser, AutoCloseable {

    static final int MAX_ATTEMPTS = 3;

    private final RestClient restClient;
    private final String projectId;
    private final Executor executor;
    private final Duration retryBackoff;

    PosthogAnalyticsEraser(RestClient.Builder restClientBuilder, PosthogProperties properties, Executor executor,
            Duration retryBackoff) {
        this.restClient = restClientBuilder
                .baseUrl(properties.apiHost())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.personalApiKey())
                .build();
        this.projectId = properties.projectId();
        this.executor = executor;
        this.retryBackoff = retryBackoff;
    }

    public static PosthogAnalyticsEraser create(PosthogProperties properties) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        requestFactory.setReadTimeout(Duration.ofSeconds(10));
        // Erasures are rare and spend their time waiting on the network, so a virtual thread each is enough.
        return new PosthogAnalyticsEraser(RestClient.builder().requestFactory(requestFactory), properties,
                Executors.newVirtualThreadPerTaskExecutor(), Duration.ofSeconds(2));
    }

    @Override
    public void erasePerson(String userId) {
        Map<String, String> context = MDC.getCopyOfContextMap();
        executor.execute(() -> {
            if (context != null) {
                MDC.setContextMap(context);
            }
            try {
                erase(userId);
            } finally {
                MDC.clear();
            }
        });
    }

    /** Waits for erasures already started, so a deploy does not drop one. */
    @Override
    public void close() {
        if (executor instanceof ExecutorService service) {
            service.close();
        }
    }

    void erase(String userId) {
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                List<String> personIds = findPersonIds(userId);
                for (String personId : personIds) {
                    deletePerson(personId);
                }
                log.info("[analytics] erased {} PostHog person(s) for user {}", personIds.size(), userId);
                return;
            } catch (HttpClientErrorException.TooManyRequests | HttpServerErrorException | ResourceAccessException e) {
                if (attempt == MAX_ATTEMPTS) {
                    fail(userId, attempt, e);
                    return;
                }
                log.warn("[analytics] erasure for user {} attempt {} failed ({}); retrying",
                        userId, attempt, e.getMessage());
                if (!sleep(retryBackoff.multipliedBy(attempt))) {
                    return;
                }
            } catch (RestClientException e) {
                fail(userId, attempt, e);
                return;
            }
        }
    }

    private List<String> findPersonIds(String distinctId) {
        PersonPage page = restClient.get()
                .uri("/api/projects/{projectId}/persons/?distinct_id={distinctId}", projectId, distinctId)
                .retrieve()
                .body(PersonPage.class);
        if (page == null || page.results() == null) {
            return List.of();
        }
        // PostHog's person id is numeric on older records and a string on newer ones.
        return page.results().stream()
                .map(person -> person.get("id"))
                .filter(Objects::nonNull)
                .map(String::valueOf)
                .toList();
    }

    private void deletePerson(String personId) {
        restClient.delete()
                .uri("/api/projects/{projectId}/persons/{personId}/?delete_events=true", projectId, personId)
                .retrieve()
                .onStatus(status -> status.isSameCodeAs(HttpStatus.NOT_FOUND), (request, response) -> {})
                .toBodilessEntity();
    }

    private static void fail(String userId, int attempts, Exception e) {
        log.error("[analytics] PostHog person for user {} not erased after {} attempt(s): {}",
                userId, attempts, e.getMessage());
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

    /** One page of PostHog's person list; only the matches are read. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record PersonPage(List<Map<String, Object>> results) {}
}
