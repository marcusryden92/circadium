package app.circadium.ws;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * The live WebSocket sessions on this instance, grouped by user. Always local: a session is a physical socket on one
 * machine, so multi-instance fan-out is the broadcaster's concern, not this map's.
 *
 * <p>Sessions are keyed by their id so a close can remove the exact one that opened, even though the handler stores a
 * {@link org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator} wrapper (its id is the delegate's).
 */
@Component
class WebSocketSessionRegistry {

    private static final Logger log = LoggerFactory.getLogger(WebSocketSessionRegistry.class);

    private final Map<String, Map<String, WebSocketSession>> sessionsByUser = new ConcurrentHashMap<>();

    void add(String userId, WebSocketSession session) {
        sessionsByUser.computeIfAbsent(userId, id -> new ConcurrentHashMap<>()).put(session.getId(), session);
    }

    void remove(String userId, String sessionId) {
        sessionsByUser.computeIfPresent(userId, (id, sessions) -> {
            sessions.remove(sessionId);
            return sessions.isEmpty() ? null : sessions;
        });
    }

    void sendToUser(String userId, String payload) {
        Map<String, WebSocketSession> sessions = sessionsByUser.get(userId);
        if (sessions == null) {
            return;
        }
        TextMessage message = new TextMessage(payload);
        for (WebSocketSession session : sessions.values()) {
            try {
                session.sendMessage(message);
            } catch (IOException | RuntimeException e) {
                // A socket closing under us is normal; the close callback prunes it.
                log.debug("Dropped a realtime message to a closing session for user {}", userId, e);
            }
        }
    }
}
