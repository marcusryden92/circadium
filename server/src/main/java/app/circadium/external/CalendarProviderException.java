package app.circadium.external;

/**
 * A calendar provider call that failed in a way the user must act on or know about. The message
 * is user-facing contract: it flows verbatim into the UI status line and the source row's
 * {@code lastError}.
 */
public class CalendarProviderException extends RuntimeException {

    public CalendarProviderException(String message) {
        super(message);
    }
}
