package app.circadium.external.ics;

/**
 * A feed that could not be fetched or read as a calendar. The message is user-facing contract:
 * it flows verbatim into the UI status line and the source row's {@code lastError}.
 */
public class IcsFeedException extends RuntimeException {

    public IcsFeedException(String message) {
        super(message);
    }
}
