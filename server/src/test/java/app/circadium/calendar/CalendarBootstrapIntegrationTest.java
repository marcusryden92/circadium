package app.circadium.calendar;

import static org.hamcrest.Matchers.contains;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.context.jdbc.Sql.ExecutionPhase.AFTER_TEST_METHOD;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.skyscreamer.jsonassert.JSONAssert;
import org.skyscreamer.jsonassert.JSONCompareMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * {@code GET /calendar/bootstrap} against the golden fixture: {@code bootstrap-expected.json} is what the web's own
 * {@code fetchFreshState} returned for {@code bootstrap-seed.sql}; the web capture was retired (plan 1.13) and the
 * fixture is now a frozen Java resource, regenerated Java-side when the seed changes.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CalendarBootstrapIntegrationTest {

    private static final List<String> LISTS = List.of("planner", "calendar", "template", "categories",
            "categoryEvents", "travelEvents", "engineMessages", "queues", "dependencies", "locations", "travelTimes");

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    /**
     * Compared as JSON values, not bytes: the response may order keys differently and write {@code 0.0} where
     * JavaScript writes {@code 0}, neither of which changes what {@code JSON.parse} gives the client. Arrays are
     * compared in any order (Prisma returns rows in none) except locations, whose oldest-first order is asserted
     * separately.
     */
    @Test
    @Sql("/calendar/bootstrap-seed.sql")
    @Sql(executionPhase = AFTER_TEST_METHOD,
            statements = "DELETE FROM \"users\" WHERE \"id\" IN ('bootstrap-user', 'bootstrap-other')")
    void returnsWhatTheWebsOwnBootstrapReturnsForTheSameRows() throws Exception {
        String expected = new ClassPathResource("calendar/bootstrap-expected.json")
                .getContentAsString(StandardCharsets.UTF_8);

        String actual = mockMvc.perform(asUser("bootstrap-user"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.locations[*].id").value(contains("bootstrap-location-b", "bootstrap-location-a")))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        JSONAssert.assertEquals(expected, actual, JSONCompareMode.NON_EXTENSIBLE);
    }

    @Test
    void aNewAccountGetsEveryListEmptyAndVersionZero() throws Exception {
        String userId = UUID.randomUUID().toString();
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\") VALUES (?, ?)", userId,
                userId + "@example.test");

        ResultActions result = mockMvc.perform(asUser(userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dataVersion").value(0));
        for (String list : LISTS) {
            result.andExpect(jsonPath("$." + list).isArray()).andExpect(jsonPath("$." + list).isEmpty());
        }
    }

    @Test
    void requiresAnAccessToken() throws Exception {
        mockMvc.perform(get("/calendar/bootstrap")).andExpect(status().isUnauthorized());
    }

    @Test
    void anAccountThatNoLongerExistsIsUnauthorized() throws Exception {
        mockMvc.perform(asUser(UUID.randomUUID().toString()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("account_not_found"));
    }

    @Test
    void theOpenApiDocumentDescribesTheResponse() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/calendar/bootstrap'].get.responses['200']"
                        + ".content['application/json'].schema['$ref']").value("#/components/schemas/BootstrapPayload"))
                .andExpect(jsonPath("$.components.schemas.BootstrapPayload.properties.dataVersion").exists())
                .andExpect(jsonPath("$.components.schemas.BootstrapPayload.properties.travelTimes.items['$ref']")
                        .value("#/components/schemas/SerializedTravelTime"))
                .andExpect(jsonPath("$.components.schemas.EventTemplate.properties.startDay.description")
                        .value("0 = Sunday through 6 = Saturday."));
    }

    private MockHttpServletRequestBuilder asUser(String userId) {
        return get("/calendar/bootstrap").with(jwt().jwt(token -> token.subject(userId)));
    }
}
