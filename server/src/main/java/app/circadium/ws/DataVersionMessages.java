package app.circadium.ws;

/** The single message the realtime channel carries, server to client. The value is a plain number, so building the
 *  JSON by hand is safe and keeps a serializer out of the hot path. */
final class DataVersionMessages {

    private DataVersionMessages() {}

    static String of(long version) {
        return "{\"type\":\"dataVersion\",\"value\":" + version + "}";
    }
}
