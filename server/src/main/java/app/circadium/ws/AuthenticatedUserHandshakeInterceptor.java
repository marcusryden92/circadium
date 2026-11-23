package app.circadium.ws;

import java.util.Map;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

/**
 * Carries the authenticated user id from the handshake request onto the WebSocket session's attributes, where the
 * handler reads it. The API security chain has already required and validated the access token on the {@code /ws}
 * GET (it is not a public endpoint), so the principal is present on this thread; the null guard is defensive.
 */
public class AuthenticatedUserHandshakeInterceptor implements HandshakeInterceptor {

    static final String USER_ID = "userId";

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Map<String, Object> attributes) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return false;
        }
        attributes.put(USER_ID, authentication.getName());
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Exception exception) {
    }
}
