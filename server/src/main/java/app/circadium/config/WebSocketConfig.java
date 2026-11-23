package app.circadium.config;

import app.circadium.ws.AuthenticatedUserHandshakeInterceptor;
import app.circadium.ws.CalendarWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Registers the realtime endpoint at {@code /ws}. The path is not public, so the API security chain has already
 * authenticated the handshake (access token from the {@code Authorization} header or the access cookie) by the time
 * it is handled; the interceptor copies the resulting user id onto the session.
 *
 * <p>Spring's own handshake origin check is set to the same web origins as {@link CorsConfig}. The handshake is a
 * cross-origin request (the web app to the API), which Spring would otherwise refuse, and this check is the
 * cross-site WebSocket hijacking defence: a page on another origin cannot open an authenticated socket with the
 * user's cookie.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSocket
class WebSocketConfig implements WebSocketConfigurer {

    private final CalendarWebSocketHandler handler;
    private final CorsProperties corsProperties;

    WebSocketConfig(CalendarWebSocketHandler handler, CorsProperties corsProperties) {
        this.handler = handler;
        this.corsProperties = corsProperties;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws")
                .addInterceptors(new AuthenticatedUserHandshakeInterceptor())
                .setAllowedOrigins(corsProperties.allowedOrigins().toArray(String[]::new));
    }
}
