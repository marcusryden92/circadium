package app.circadium.external.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.never;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class PosthogAnalyticsEraserTest {

    private static final PosthogProperties PROPERTIES =
            new PosthogProperties("phx_test_key", "4242", "https://posthog.test");
    private static final String LOOKUP = "https://posthog.test/api/projects/4242/persons/?distinct_id=user-1";

    private MockRestServiceServer server;
    private PosthogAnalyticsEraser eraser;
    private final List<Runnable> queued = new ArrayList<>();

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        eraser = new PosthogAnalyticsEraser(builder, PROPERTIES, queued::add, Duration.ZERO);
    }

    @Test
    void deletesEveryPersonWithTheUsersDistinctIdAndTheirEvents() {
        server.expect(once(), requestTo(LOOKUP))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer phx_test_key"))
                .andRespond(withSuccess("""
                        {"next":null,"results":[{"id":17,"uuid":"0190-a"},{"id":"0190-b"}]}""",
                        MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://posthog.test/api/projects/4242/persons/17/?delete_events=true"))
                .andExpect(method(HttpMethod.DELETE))
                .andExpect(header("Authorization", "Bearer phx_test_key"))
                .andRespond(withStatus(HttpStatus.ACCEPTED));
        server.expect(once(), requestTo("https://posthog.test/api/projects/4242/persons/0190-b/?delete_events=true"))
                .andExpect(method(HttpMethod.DELETE))
                .andRespond(withStatus(HttpStatus.NO_CONTENT));

        eraser.erasePerson("user-1");
        runQueued();

        server.verify();
    }

    @Test
    void returnsBeforeTalkingToPosthog() {
        server.expect(never(), requestTo(LOOKUP));

        eraser.erasePerson("user-1");

        server.verify();
        assertThat(queued).hasSize(1);
    }

    @Test
    void anUnknownUserNeedsNoDelete() {
        server.expect(once(), requestTo(LOOKUP))
                .andRespond(withSuccess("{\"results\":[]}", MediaType.APPLICATION_JSON));

        eraser.erase("user-1");

        server.verify();
    }

    @Test
    void aPersonAlreadyDeletedCountsAsErased() {
        server.expect(once(), requestTo(LOOKUP))
                .andRespond(withSuccess("{\"results\":[{\"id\":17}]}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://posthog.test/api/projects/4242/persons/17/?delete_events=true"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        eraser.erase("user-1");

        server.verify();
    }

    @Test
    void retriesTheWholeErasureOnServerErrorsAndRateLimits() {
        server.expect(once(), requestTo(LOOKUP)).andRespond(withServerError());
        server.expect(once(), requestTo(LOOKUP))
                .andRespond(withSuccess("{\"results\":[{\"id\":17}]}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://posthog.test/api/projects/4242/persons/17/?delete_events=true"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        server.expect(once(), requestTo(LOOKUP))
                .andRespond(withSuccess("{\"results\":[{\"id\":17}]}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://posthog.test/api/projects/4242/persons/17/?delete_events=true"))
                .andRespond(withStatus(HttpStatus.ACCEPTED));

        eraser.erase("user-1");

        server.verify();
    }

    @Test
    void givesUpAfterTheLastAttempt() {
        server.expect(times(PosthogAnalyticsEraser.MAX_ATTEMPTS), requestTo(LOOKUP))
                .andRespond(withServerError());

        eraser.erase("user-1");

        server.verify();
    }

    @Test
    void doesNotRetryARequestPosthogRefuses() {
        server.expect(once(), requestTo(LOOKUP)).andRespond(withStatus(HttpStatus.FORBIDDEN));

        eraser.erase("user-1");

        server.verify();
    }

    @Test
    void configuredOnlyWithBothKeyAndProject() {
        assertThat(PROPERTIES.configured()).isTrue();
        assertThat(new PosthogProperties("phx_test_key", " ", "https://posthog.test").configured()).isFalse();
        assertThat(new PosthogProperties(null, "4242", "https://posthog.test").configured()).isFalse();
    }

    private void runQueued() {
        queued.forEach(Runnable::run);
        queued.clear();
    }
}
