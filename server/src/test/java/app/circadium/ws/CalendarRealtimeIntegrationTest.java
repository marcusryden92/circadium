package app.circadium.ws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.context.jdbc.Sql.ExecutionPhase.AFTER_TEST_METHOD;

import app.circadium.TestcontainersConfiguration;
import app.circadium.auth.TokenService;
import app.circadium.persistence.repository.UserRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * The realtime channel over a real port, since a WebSocket upgrade needs the running container MockMvc does not have.
 * The seed's {@code bootstrap-user} is at dataVersion 7, so a connect hears a hello of 7 and a committed sync moves
 * every one of the user's sessions to 8. The context is closed afterwards rather than cached, like the compression
 * test, so its real-port cost does not outlast Surefire's exit timeout.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@DirtiesContext
@Import(TestcontainersConfiguration.class)
@Sql("/calendar/bootstrap-seed.sql")
@Sql(executionPhase = AFTER_TEST_METHOD,
        statements = "DELETE FROM \"users\" WHERE \"id\" IN ('bootstrap-user', 'bootstrap-other')")
class CalendarRealtimeIntegrationTest {

    private static final String[] EMPTY_GROUPS = {"planner", "calendar", "template", "extendedProps", "category",
            "categoryTimeWindow", "categoryEvent", "travelEvent", "engineMessage", "queue", "queueMember",
            "dependency", "travelTime"};

    private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
    private final StandardWebSocketClient wsClient = new StandardWebSocketClient();

    @LocalServerPort
    int port;

    @Autowired
    TokenService tokenService;

    @Autowired
    UserRepository userRepository;

    @Test
    void aCommittedSyncReachesEverySessionOfTheUser() throws Exception {
        String token = accessToken("bootstrap-user");
        BlockingQueue<String> first = new LinkedBlockingQueue<>();
        BlockingQueue<String> second = new LinkedBlockingQueue<>();

        try (WebSocketSession a = connect(token, first); WebSocketSession b = connect(token, second)) {
            assertThat(a.isOpen()).isTrue();
            assertThat(b.isOpen()).isTrue();
            // The hello on connect carries the account's current version.
            assertThat(first.poll(5, TimeUnit.SECONDS)).isEqualTo(dataVersionMessage(7));
            assertThat(second.poll(5, TimeUnit.SECONDS)).isEqualTo(dataVersionMessage(7));

            HttpResponse<String> sync = http.send(
                    HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/calendar/sync"))
                            .header("Authorization", "Bearer " + token)
                            .header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(syncAtVersion(7)))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(sync.statusCode()).isEqualTo(200);

            assertThat(first.poll(5, TimeUnit.SECONDS)).isEqualTo(dataVersionMessage(8));
            assertThat(second.poll(5, TimeUnit.SECONDS)).isEqualTo(dataVersionMessage(8));
        }
    }

    @Test
    void aClientPingIsAnsweredWithAPong() throws Exception {
        String token = accessToken("bootstrap-user");
        BlockingQueue<String> inbox = new LinkedBlockingQueue<>();

        try (WebSocketSession session = connect(token, inbox)) {
            assertThat(inbox.poll(5, TimeUnit.SECONDS)).isEqualTo(dataVersionMessage(7)); // the hello
            session.sendMessage(new TextMessage("{\"type\":\"ping\"}"));
            assertThat(inbox.poll(5, TimeUnit.SECONDS)).isEqualTo("{\"type\":\"pong\"}");
        }
    }

    @Test
    void aHandshakeWithoutATokenIsRejected() {
        assertThatThrownBy(() -> wsClient.execute(new TextWebSocketHandler() {}, new WebSocketHttpHeaders(),
                        URI.create("ws://localhost:" + port + "/ws"))
                .get(5, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class);
    }

    private WebSocketSession connect(String token, BlockingQueue<String> inbox) throws Exception {
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add("Authorization", "Bearer " + token);
        return wsClient.execute(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession session, TextMessage message) {
                inbox.add(message.getPayload());
            }
        }, headers, URI.create("ws://localhost:" + port + "/ws")).get(5, TimeUnit.SECONDS);
    }

    private String accessToken(String userId) {
        return tokenService.startSession(userRepository.findById(userId).orElseThrow(), null).accessToken();
    }

    private static String dataVersionMessage(int version) {
        return "{\"type\":\"dataVersion\",\"value\":" + version + "}";
    }

    /** A non-empty diff (an empty one does not bump the version) that writes nothing: a destroy of a row that is not
     *  there. Sent at the seed's current version, so it commits and moves it to 8. */
    private static String syncAtVersion(int clientKnownDataVersion) {
        StringBuilder changes = new StringBuilder("{");
        for (String group : EMPTY_GROUPS) {
            changes.append('"').append(group).append("\":{\"create\":[],\"update\":[],\"destroy\":[]},");
        }
        changes.append("\"location\":{\"create\":[],\"update\":[],\"destroy\":[{\"id\":\"no-such-location\"}]}}");
        return "{\"changes\":" + changes + ",\"clientKnownDataVersion\":" + clientKnownDataVersion + "}";
    }
}
