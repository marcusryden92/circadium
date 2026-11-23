package app.circadium.sync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import app.circadium.TestcontainersConfiguration;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Comparator;
import java.util.stream.Stream;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.skyscreamer.jsonassert.JSONAssert;
import org.skyscreamer.jsonassert.JSONCompareMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Replays the golden corpus ({@code sync/corpus/*.json}) against {@code POST /calendar/sync}. Each file is a diff the
 * web's own {@code syncCalendarData} applied to {@code calendar/bootstrap-seed.sql}, with its response and every row
 * it left; the web capture was retired (plan 1.13) and the corpus is now a frozen Java resource. The Java sync must
 * answer the same way and leave the same rows, read back through the same {@code sync/dump-state.sql}.
 *
 * <p>The clock is frozen at the capture's instant, so the writer's engine-output {@code createdAt} stamps compare
 * exactly. {@code updatedAt} is DB-owned (column default on insert, trigger on update, plan 1.13b), so it is not
 * deterministic under the frozen clock; {@code dumpState} replaces it with a marker and the corpus no longer asserts
 * it (content, createdAt and the response/version are still asserted).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, SyncCorpusIntegrationTest.FrozenClock.class})
class SyncCorpusIntegrationTest {

    private static final Instant FROZEN_NOW = Instant.parse("2026-03-02T06:00:00Z");
    private static final String USER_ID = "bootstrap-user";
    private static final String DB_OWNED = "<db-owned>";
    /** The DoD's load bound: the first-regen scenario must finish well inside the sync's 60-second limit. */
    private static final Duration WELL_INSIDE_TIMEOUT = Duration.ofSeconds(10);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    DataSource dataSource;

    @TestConfiguration(proxyBeanMethods = false)
    static class FrozenClock {

        @Bean
        @Primary
        Clock frozenClock() {
            return Clock.fixed(FROZEN_NOW, ZoneOffset.UTC);
        }
    }

    @TestFactory
    Stream<DynamicTest> eachDiffLeavesTheRowsTheWebsOwnSyncLeft() throws IOException {
        Resource[] scenarios = new PathMatchingResourcePatternResolver().getResources("classpath:sync/corpus/*.json");
        assertThat(scenarios).hasSizeGreaterThanOrEqualTo(12);
        return Arrays.stream(scenarios)
                .sorted(Comparator.comparing(Resource::getFilename))
                .map(scenario -> DynamicTest.dynamicTest(scenario.getFilename(), () -> replay(scenario)));
    }

    @AfterEach
    void removeSeed() {
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" IN ('bootstrap-user', 'bootstrap-other')");
    }

    private void replay(Resource file) throws Exception {
        JsonNode scenario = JSON.readTree(file.getContentAsString(StandardCharsets.UTF_8));
        removeSeed();
        new ResourceDatabasePopulator(new ClassPathResource("calendar/bootstrap-seed.sql")).execute(dataSource);

        ObjectNode body = JSON.createObjectNode();
        body.set("changes", scenario.get("changes"));
        body.set("clientKnownDataVersion", scenario.get("clientKnownDataVersion"));

        long started = System.nanoTime();
        MockHttpServletResponse response = mockMvc.perform(post("/calendar/sync")
                        .with(jwt().jwt(token -> token.subject(USER_ID)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andReturn().getResponse();
        Duration elapsed = Duration.ofNanos(System.nanoTime() - started);
        String content = response.getContentAsString(StandardCharsets.UTF_8);

        JsonNode expected = scenario.get("response");
        if (expected.get("success").asBoolean()) {
            assertThat(response.getStatus()).as(content).isEqualTo(200);
            JSONAssert.assertEquals("{\"newDataVersion\":" + expected.get("newDataVersion") + "}", content,
                    JSONCompareMode.STRICT);
        } else {
            assertThat(response.getStatus()).as(content).isEqualTo(409);
            JsonNode problem = JSON.readTree(content);
            assertThat(problem.get("code").asString()).isEqualTo("stale");
            // Any array order: the web's freshState comes from Prisma, which promises none.
            JSONAssert.assertEquals(expected.get("freshState").toString(), problem.get("freshState").toString(),
                    JSONCompareMode.NON_EXTENSIBLE);
        }

        JSONAssert.assertEquals(scenario.get("after").toString(), dumpState(), JSONCompareMode.STRICT);
        assertThat(elapsed).as("%s took %s", file.getFilename(), elapsed).isLessThan(WELL_INSIDE_TIMEOUT);
    }

    private String dumpState() throws IOException {
        String sql = new ClassPathResource("sync/dump-state.sql").getContentAsString(StandardCharsets.UTF_8);
        JsonNode state = JSON.readTree(jdbcTemplate.queryForObject(sql, String.class));
        for (JsonNode rows : state) {
            for (JsonNode row : rows) {
                if (row.has("updatedAt")) {
                    ((ObjectNode) row).put("updatedAt", DB_OWNED);
                }
            }
        }
        return state.toString();
    }
}
