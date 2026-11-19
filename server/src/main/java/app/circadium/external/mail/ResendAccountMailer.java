package app.circadium.external.mail;

import io.sentry.Sentry;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Sends account mail through Resend's HTTP API ({@code POST /emails}).
 *
 * <p>Messages go onto a small background pool so requests never wait on Resend. Rate limiting (429), server
 * errors, and network failures are retried with the same {@code Idempotency-Key}, so a retry after a timeout
 * cannot deliver the message twice. Other 4xx responses mean the request itself is wrong and are not retried.
 * A message that still fails is logged and reported to Sentry; the user can ask for it again.
 */
@Slf4j
public class ResendAccountMailer implements AccountMailer, AutoCloseable {

    static final int MAX_ATTEMPTS = 3;

    private final RestClient restClient;
    private final AccountEmails emails;
    private final Executor executor;
    private final Duration retryBackoff;

    ResendAccountMailer(RestClient.Builder restClientBuilder, MailProperties properties, AccountEmails emails,
            Executor executor, Duration retryBackoff) {
        this.restClient = restClientBuilder
                .baseUrl(properties.resendBaseUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.resendApiKey())
                .build();
        this.emails = emails;
        this.executor = executor;
        this.retryBackoff = retryBackoff;
    }

    public static ResendAccountMailer create(MailProperties properties) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        requestFactory.setReadTimeout(Duration.ofSeconds(10));
        return new ResendAccountMailer(RestClient.builder().requestFactory(requestFactory), properties,
                new AccountEmails(properties), mailExecutor(), Duration.ofSeconds(1));
    }

    @Override
    public void sendVerificationEmail(String email, String token) {
        dispatch(emails.verification(email, token));
    }

    @Override
    public void sendTwoFactorCode(String email, String code) {
        dispatch(emails.twoFactorCode(email, code));
    }

    @Override
    public void sendPasswordResetEmail(String email, String token) {
        dispatch(emails.passwordReset(email, token));
    }

    @Override
    public void sendPasswordChangedNotice(String email) {
        dispatch(emails.passwordChanged(email));
    }

    @Override
    public void sendAccountDeletionEmail(String email, String token) {
        dispatch(emails.accountDeletion(email, token));
    }

    @Override
    public void sendExistingAccountNotice(String email, boolean hasPassword) {
        dispatch(emails.existingAccount(email, hasPassword));
    }

    /** Waits for queued messages so a deploy does not drop mail that requests already promised. */
    @Override
    public void close() {
        if (executor instanceof ThreadPoolTaskExecutor pool) {
            pool.shutdown();
        }
    }

    private void dispatch(EmailMessage message) {
        executor.execute(() -> deliver(message));
    }

    void deliver(EmailMessage message) {
        String idempotencyKey = UUID.randomUUID().toString();
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                restClient.post()
                        .uri("/emails")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(payload(message))
                        .retrieve()
                        .toBodilessEntity();
                log.info("[mail] {} sent", message.kind());
                return;
            } catch (HttpClientErrorException.TooManyRequests | HttpServerErrorException | ResourceAccessException e) {
                if (attempt == MAX_ATTEMPTS) {
                    fail(message, attempt, e);
                    return;
                }
                log.warn("[mail] {} attempt {} failed ({}); retrying", message.kind(), attempt, e.getMessage());
                if (!sleep(retryBackoff.multipliedBy(attempt))) {
                    return;
                }
            } catch (RestClientException e) {
                fail(message, attempt, e);
                return;
            }
        }
    }

    private static Map<String, Object> payload(EmailMessage message) {
        return Map.of(
                "from", message.from(),
                "to", List.of(message.to()),
                "subject", message.subject(),
                "html", message.html(),
                "text", message.text());
    }

    private static void fail(EmailMessage message, int attempts, Exception e) {
        log.error("[mail] {} not delivered after {} attempt(s): {}", message.kind(), attempts, e.getMessage());
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

    /**
     * A bounded pool: when the queue is full the calling request sends the message itself, which is slower
     * but never drops mail. Each task carries the request's MDC so its log lines keep the request id.
     */
    private static ThreadPoolTaskExecutor mailExecutor() {
        ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
        pool.setThreadNamePrefix("mail-");
        pool.setCorePoolSize(2);
        pool.setMaxPoolSize(4);
        pool.setQueueCapacity(500);
        pool.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        pool.setWaitForTasksToCompleteOnShutdown(true);
        pool.setAwaitTerminationSeconds(10);
        pool.setTaskDecorator(copyMdc());
        pool.initialize();
        return pool;
    }

    private static TaskDecorator copyMdc() {
        return task -> {
            Map<String, String> context = MDC.getCopyOfContextMap();
            return () -> {
                Map<String, String> previous = MDC.getCopyOfContextMap();
                if (context == null) {
                    MDC.clear();
                } else {
                    MDC.setContextMap(context);
                }
                try {
                    task.run();
                } finally {
                    if (previous == null) {
                        MDC.clear();
                    } else {
                        MDC.setContextMap(previous);
                    }
                }
            };
        };
    }
}
