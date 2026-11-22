package app.circadium.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.context.jdbc.Sql.ExecutionPhase.AFTER_TEST_METHOD;

import app.circadium.TestcontainersConfiguration;
import app.circadium.auth.TokenService;
import app.circadium.persistence.repository.UserRepository;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.jdbc.Sql;

/**
 * Compression is done by the embedded Tomcat, which MockMvc bypasses, so these requests go over a real port with a
 * real access token. The seed's calendar is well over the 2 KB below which responses are sent as they are. The
 * context is closed afterwards rather than cached: no other test shares it, and closing it at JVM exit along with
 * every cached one outlasts Surefire's exit timeout.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@DirtiesContext
@Import(TestcontainersConfiguration.class)
@Sql("/calendar/bootstrap-seed.sql")
@Sql(executionPhase = AFTER_TEST_METHOD,
        statements = "DELETE FROM \"users\" WHERE \"id\" IN ('bootstrap-user', 'bootstrap-other')")
class ResponseCompressionIntegrationTest {

    private static final String GROUPS = String.join(",", "planner", "calendar", "template", "extendedProps",
            "category", "categoryTimeWindow", "categoryEvent", "travelEvent", "engineMessage", "queue", "queueMember",
            "dependency", "travelTime");

    /** HTTP/1.1, so the client does not try an h2c upgrade on the plain-HTTP port. */
    private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();

    @LocalServerPort
    int port;

    @Autowired
    TokenService tokenService;

    @Autowired
    UserRepository userRepository;

    @Test
    void theBootstrapIsGzippedForAClientThatAcceptsIt() throws Exception {
        HttpResponse<byte[]> response = http.send(
                request("/calendar/bootstrap").header("Accept-Encoding", "gzip").GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Encoding")).hasValue("gzip");
        assertThat(gunzip(response.body())).contains("\"dataVersion\":7");
    }

    @Test
    void theBootstrapIsSentAsItIsToAClientThatDoesNotAcceptGzip() throws Exception {
        HttpResponse<String> response = http.send(request("/calendar/bootstrap").GET().build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Encoding")).isEmpty();
        assertThat(response.body()).contains("\"dataVersion\":7");
    }

    /** The 409 is {@code application/problem+json}, which Spring's default list of compressible types leaves out. */
    @Test
    void aStaleSyncsProblemIsGzippedToo() throws Exception {
        HttpResponse<byte[]> response = http.send(
                request("/calendar/sync")
                        .header("Accept-Encoding", "gzip")
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(staleSync()))
                        .build(),
                HttpResponse.BodyHandlers.ofByteArray());

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(
                type -> assertThat(type).startsWith("application/problem+json"));
        assertThat(response.headers().firstValue("Content-Encoding")).hasValue("gzip");
        assertThat(gunzip(response.body())).contains("\"code\":\"stale\"").contains("\"freshState\"");
    }

    private HttpRequest.Builder request(String path) {
        String accessToken = tokenService
                .startSession(userRepository.findById("bootstrap-user").orElseThrow(), null)
                .accessToken();
        return HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Authorization", "Bearer " + accessToken);
    }

    /** A non-empty diff (an empty one succeeds without a version check) sent one version behind the seed's 7. */
    private static String staleSync() {
        StringBuilder changes = new StringBuilder("{");
        for (String group : GROUPS.split(",")) {
            changes.append('"').append(group).append("\":{\"create\":[],\"update\":[],\"destroy\":[]},");
        }
        changes.append("\"location\":{\"create\":[],\"update\":[],\"destroy\":[{\"id\":\"no-such-location\"}]}}");
        return "{\"changes\":" + changes + ",\"clientKnownDataVersion\":6}";
    }

    private static String gunzip(byte[] body) throws IOException {
        try (GZIPInputStream in = new GZIPInputStream(new ByteArrayInputStream(body))) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
