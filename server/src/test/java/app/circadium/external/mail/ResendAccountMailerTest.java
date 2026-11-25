package app.circadium.external.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
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

class ResendAccountMailerTest {

    private static final MailProperties PROPERTIES = new MailProperties("re_test_key", "https://api.resend.test",
            "https://app.example.com/", "Circadium <security@circadium.app>", "Circadium <no-reply@circadium.app>",
            "support@circadium.app", false);

    private MockRestServiceServer server;
    private ResendAccountMailer mailer;
    private final List<String> idempotencyKeys = new ArrayList<>();

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        mailer = new ResendAccountMailer(builder, PROPERTIES, new AccountEmails(PROPERTIES), Runnable::run,
                Duration.ZERO);
    }

    @Test
    void postsTheRenderedMessageWithTheApiKey() {
        server.expect(once(), requestTo("https://api.resend.test/emails"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer re_test_key"))
                .andExpect(request -> idempotencyKeys.add(request.getHeaders().getFirst("Idempotency-Key")))
                .andExpect(jsonPath("$.from").value("Circadium <no-reply@circadium.app>"))
                .andExpect(jsonPath("$.to[0]").value("user@example.com"))
                .andExpect(jsonPath("$.subject").value("Reset your password"))
                .andExpect(jsonPath("$.html").value(containsString(
                        "https://app.example.com/auth/new-password?token=abc-123")))
                .andExpect(jsonPath("$.text").value(containsString(
                        "https://app.example.com/auth/new-password?token=abc-123")))
                .andRespond(withSuccess("{\"id\":\"msg_1\"}", MediaType.APPLICATION_JSON));

        mailer.sendPasswordResetEmail("user@example.com", "abc-123");

        server.verify();
        assertThat(idempotencyKeys).singleElement().isNotNull();
    }

    @Test
    void retriesServerErrorsAndRateLimitsWithTheSameIdempotencyKey() {
        server.expect(once(), requestTo("https://api.resend.test/emails"))
                .andExpect(request -> idempotencyKeys.add(request.getHeaders().getFirst("Idempotency-Key")))
                .andRespond(withServerError());
        server.expect(once(), requestTo("https://api.resend.test/emails"))
                .andExpect(request -> idempotencyKeys.add(request.getHeaders().getFirst("Idempotency-Key")))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        server.expect(once(), requestTo("https://api.resend.test/emails"))
                .andExpect(request -> idempotencyKeys.add(request.getHeaders().getFirst("Idempotency-Key")))
                .andRespond(withSuccess("{\"id\":\"msg_1\"}", MediaType.APPLICATION_JSON));

        mailer.sendTwoFactorCode("user@example.com", "123456");

        server.verify();
        assertThat(idempotencyKeys).hasSize(3).containsOnly(idempotencyKeys.getFirst());
    }

    @Test
    void doesNotRetryARejectedRequest() {
        server.expect(once(), requestTo("https://api.resend.test/emails"))
                .andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY));

        mailer.sendVerificationEmail("user@example.com", "token");

        server.verify();
    }

    @Test
    void givesUpAfterTheLastAttemptWithoutThrowing() {
        server.expect(times(ResendAccountMailer.MAX_ATTEMPTS), requestTo("https://api.resend.test/emails"))
                .andRespond(withServerError());

        mailer.sendAccountDeletionEmail("user@example.com", "token");

        server.verify();
    }
}
