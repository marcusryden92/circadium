package app.circadium.ws;

/**
 * Tells all of a user's live sessions that their calendar has advanced to {@code version}.
 *
 * <p>This interface is the multi-instance seam. The single-instance deployment delivers straight to the sockets this
 * instance holds ({@link LocalDataVersionBroadcaster}); scaling out replaces the implementation with a Redis (or
 * similar) pub/sub fan-out that each instance subscribes to and then delivers locally. The per-instance socket
 * bookkeeping in {@link WebSocketSessionRegistry} is always local and does not change.
 */
public interface DataVersionBroadcaster {

    void broadcast(String userId, long version);
}
