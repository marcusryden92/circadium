package app.circadium.external.maps;

import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;
import org.springframework.web.client.RestClientResponseException;

/** The TS fetchWithRetry: three attempts on transient statuses, exponential backoff with jitter. */
final class MapsHttp {

    private static final Set<Integer> RETRYABLE_STATUS = Set.of(429, 500, 502, 503, 504);
    private static final int ATTEMPTS = 3;

    private MapsHttp() {
    }

    static <T> T withRetry(Supplier<T> call) {
        for (int attempt = 0; ; attempt++) {
            try {
                return call.get();
            } catch (RestClientResponseException e) {
                if (attempt >= ATTEMPTS - 1 || !RETRYABLE_STATUS.contains(e.getStatusCode().value())) {
                    throw e;
                }
                try {
                    Thread.sleep(500L * (1L << attempt) + ThreadLocalRandom.current().nextLong(250));
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
    }
}
