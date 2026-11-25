package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import org.springframework.test.json.JsonCompareMode;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * The canvas view-state endpoints against the retired Prisma action's semantics: one row per user, each
 * canvas's column patched on its own so the two never clobber each other, nulls for a row or column that
 * was never saved, and no {@code dataVersion} movement.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ViewStateIntegrationTest {

    private static final String USER = "view-state-user";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void seed() {
        jdbcTemplate.update("INSERT INTO \"users\" (\"id\", \"email\", \"dataVersion\") VALUES (?, ?, 9)",
                USER, USER + "@example.test");
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM \"users\" WHERE \"id\" = ?", USER);
    }

    @Test
    void aMissingRowReadsAsBothBlobsNull() throws Exception {
        mockMvc.perform(get("/view-state").with(asUser(USER)))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"graph\":null,\"mindmap\":null}", JsonCompareMode.STRICT));
    }

    @Test
    void eachCanvasPatchesItsOwnColumn() throws Exception {
        mockMvc.perform(save(USER, "graph", "\"{\\\"zoom\\\":40}\"")).andExpect(status().isNoContent());
        mockMvc.perform(get("/view-state").with(asUser(USER)))
                .andExpect(jsonPath("$.graph").value("{\"zoom\":40}"))
                .andExpect(jsonPath("$.mindmap").value((Object) null));

        mockMvc.perform(save(USER, "mindmap", "\"{\\\"hideEmpty\\\":true}\"")).andExpect(status().isNoContent());
        Map<String, Object> afterBoth = row();
        assertThat(afterBoth.get("graph")).isEqualTo("{\"zoom\":40}");
        assertThat(afterBoth.get("mindmap")).isEqualTo("{\"hideEmpty\":true}");

        mockMvc.perform(save(USER, "graph", "\"{\\\"zoom\\\":70}\"")).andExpect(status().isNoContent());
        Map<String, Object> afterUpdate = row();
        assertThat(afterUpdate.get("id")).isEqualTo(afterBoth.get("id"));
        assertThat(afterUpdate.get("graph")).isEqualTo("{\"zoom\":70}");
        assertThat(afterUpdate.get("mindmap")).isEqualTo("{\"hideEmpty\":true}");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM \"UserViewStates\" WHERE \"userId\" = ?", Integer.class, USER)).isEqualTo(1);
    }

    @Test
    void aNullStateClearsOnlyThatCanvas() throws Exception {
        mockMvc.perform(save(USER, "graph", "\"g\"")).andExpect(status().isNoContent());
        mockMvc.perform(save(USER, "mindmap", "\"m\"")).andExpect(status().isNoContent());
        mockMvc.perform(save(USER, "graph", "null")).andExpect(status().isNoContent());

        mockMvc.perform(get("/view-state").with(asUser(USER)))
                .andExpect(content().json("{\"graph\":null,\"mindmap\":\"m\"}", JsonCompareMode.STRICT));
    }

    @Test
    void anUnknownKindIsRejected() throws Exception {
        mockMvc.perform(put("/view-state").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"sideways\",\"state\":\"x\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put("/view-state").with(asUser(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"state\":\"x\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void viewStateNeverMovesDataVersion() throws Exception {
        mockMvc.perform(save(USER, "graph", "\"g\"")).andExpect(status().isNoContent());
        mockMvc.perform(save(USER, "graph", "\"h\"")).andExpect(status().isNoContent());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?", Integer.class, USER)).isEqualTo(9);
    }

    @Test
    void bothEndpointsRequireAnAccessToken() throws Exception {
        mockMvc.perform(get("/view-state")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/view-state").contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"graph\",\"state\":\"x\"}")).andExpect(status().isUnauthorized());
    }

    private RequestPostProcessor asUser(String userId) {
        return jwt().jwt(token -> token.subject(userId));
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder save(String userId,
            String kind, String stateJson) {
        return put("/view-state").with(asUser(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"" + kind + "\",\"state\":" + stateJson + "}");
    }

    private Map<String, Object> row() {
        return jdbcTemplate.queryForMap(
                "SELECT \"id\", \"graph\", \"mindmap\" FROM \"UserViewStates\" WHERE \"userId\" = ?", USER);
    }
}
