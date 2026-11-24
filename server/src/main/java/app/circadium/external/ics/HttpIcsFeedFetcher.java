package app.circadium.external.ics;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** The TS fetchIcsText transport half: follow redirects, 15 seconds for the whole transfer. */
public class HttpIcsFeedFetcher implements IcsFeedFetcher {

    private static final Duration RESPONSE_TIMEOUT = Duration.ofSeconds(15);

    // ALWAYS, not NORMAL: the TS fetch followed scheme-downgrade redirects too, and a feed
    // behind an https-to-http hop must import rather than surface the raw 301.
    private final HttpClient httpClient = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.ALWAYS)
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Override
    public String fetch(String url) {
        HttpRequest request;
        try {
            request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(RESPONSE_TIMEOUT)
                    .header("Accept", "text/calendar, text/plain, */*")
                    .GET()
                    .build();
        } catch (IllegalArgumentException e) {
            throw new IcsFeedException("That doesn't look like a valid URL");
        }
        // The request timeout above covers only status+headers (JDK semantics); the TS abort
        // controller cut the whole transfer at 15s, so the body read needs its own deadline or
        // a tarpit feed that answers headers quickly then drips bytes hangs the request thread.
        CompletableFuture<HttpResponse<String>> future =
                httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString());
        HttpResponse<String> response;
        try {
            response = future.get(RESPONSE_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new IcsFeedException("The feed took too long to respond");
        } catch (InterruptedException e) {
            future.cancel(true);
            Thread.currentThread().interrupt();
            throw new IcsFeedException("The feed took too long to respond");
        } catch (ExecutionException e) {
            // Every transport failure becomes a feed error, like the TS catch-all around fetch;
            // anything else escaping here would skip the refresh path's lastError write.
            throw new IcsFeedException(e.getCause() instanceof HttpTimeoutException
                    ? "The feed took too long to respond"
                    : "The feed could not be fetched");
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IcsFeedException("The feed responded with status " + response.statusCode());
        }
        return response.body();
    }
}
