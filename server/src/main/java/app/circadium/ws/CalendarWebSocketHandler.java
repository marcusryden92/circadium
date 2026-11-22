package app.circadium.ws;

import java.sql.ResultSet;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * The realtime endpoint. A connection pushes the user's calendar {@code dataVersion}: a hello carrying the current
 * value on connect (so a client that reconnects after missing updates catches up with no other message), and then
 * whatever the broadcaster sends after a committed sync. Inbound frames (the client's keepalive ping) are ignored.
 *
 * <p>Each session is wrapped in a {@link ConcurrentWebSocketSessionDecorator} before it is registered, so a broadcast
 * and the hello can never write to one socket at the same time.
 */
@Component
public class CalendarWebSocketHandler extends TextWebSocketHandler {

    private static final int SEND_TIME_LIMIT_MS = 5_000;
    private static final int SEND_BUFFER_LIMIT_BYTES = 256 * 1024;

    private final WebSocketSessionRegistry registry;
    private final JdbcTemplate jdbcTemplate;

    CalendarWebSocketHandler(WebSocketSessionRegistry registry, JdbcTemplate jdbcTemplate) {
        this.registry = registry;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String userId = (String) session.getAttributes().get(AuthenticatedUserHandshakeInterceptor.USER_ID);
        if (userId == null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        WebSocketSession concurrencySafe =
                new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, SEND_BUFFER_LIMIT_BYTES);
        registry.add(userId, concurrencySafe);

        Long version = currentDataVersion(userId);
        if (version != null) {
            concurrencySafe.sendMessage(new TextMessage(DataVersionMessages.of(version)));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String userId = (String) session.getAttributes().get(AuthenticatedUserHandshakeInterceptor.USER_ID);
        if (userId != null) {
            registry.remove(userId, session.getId());
        }
    }

    private Long currentDataVersion(String userId) {
        return jdbcTemplate.query("SELECT \"dataVersion\" FROM \"users\" WHERE \"id\" = ?",
                (ResultSet rs) -> rs.next() ? Long.valueOf(rs.getLong("dataVersion")) : null, userId);
    }
}
