package app.circadium.ws;

import org.springframework.stereotype.Component;

/** Single-instance fan-out: deliver straight to the sockets this instance holds. */
@Component
class LocalDataVersionBroadcaster implements DataVersionBroadcaster {

    private final WebSocketSessionRegistry registry;

    LocalDataVersionBroadcaster(WebSocketSessionRegistry registry) {
        this.registry = registry;
    }

    @Override
    public void broadcast(String userId, long version) {
        registry.sendToUser(userId, DataVersionMessages.of(version));
    }
}
