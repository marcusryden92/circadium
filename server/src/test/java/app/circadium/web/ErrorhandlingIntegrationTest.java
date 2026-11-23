package app.circadium.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import io.sentry.Sentry;
import io.sentry.SentryEvent;
import io.sentry.SentryOptions;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
        "sentry.dsn=http://publickey@localhost:9/1"
})
@AutoConfigureMockMvc
@ActiveProfiles({"local", "diagnostics"})
@Import({TestcontainersConfiguration.class, ErrorHandlingIntegrationTest.RecordingSentryConfig.class})
class ErrorHandlingIntegrationTest {

    static final List<SentryEvent> CAPTURED = new CopyOnWriteArrayList<>();

    @Autowired
    MockMvc mockMvc;

    @BeforeEach
    void clearCaptured() {
        CAPTURED.clear();
    }

    @Test
    void unhandledExceptionProducesProblemDetailCorrelationIdAndSentryEvent() throws Exception {
        MvcResult result = mockMvc.perform(get("/internal/diagnostics/boom")
                        .with(jwt()))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(header().exists("X-Request-Id"))
                .andExpect(jsonPath("$.status").value(500))
                .andExpect(jsonPath("$.requestId").isNotEmpty())
                .andReturn();

        String requestId = result.getResponse().getHeader("X-Request-Id");
        assertThat(CAPTURED).hasSize(1);
        assertThat(CAPTURED.getFirst().getTags()).containsEntry("request_id", requestId);
    }

    @Test
    void validationFailureProducesProblemDetailWithFieldErrorsAndNoSentryEvent() throws Exception {
        mockMvc.perform(post("/internal/diagnostics/validate")
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.errors.name").isNotEmpty());

        assertThat(CAPTURED).isEmpty();
    }

    @Test
    void missingTokenProducesProblemDetail401() throws Exception {
        mockMvc.perform(get("/calendar/bootstrap"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.requestId").isNotEmpty());
    }

    @Test
    void garbledBearerTokenProducesProblemDetail401WithWwwAuthenticate() throws Exception {
        mockMvc.perform(get("/calendar/bootstrap")
                        .header("Authorization", "Bearer not-a-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().exists("WWW-Authenticate"))
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void disallowedOriginProducesProblemDetail403() throws Exception {
        mockMvc.perform(post("/calendar/sync")
                        .with(jwt())
                        .header("Origin", "https://attacker.example"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(403));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class RecordingSentryConfig {
        @Bean
        Sentry.OptionsConfiguration<SentryOptions> recordingSentryOptions() {
            return options -> options.setBeforeSend((event, hint) -> {
                CAPTURED.add(event);
                return null;
            });
        }
    }
}