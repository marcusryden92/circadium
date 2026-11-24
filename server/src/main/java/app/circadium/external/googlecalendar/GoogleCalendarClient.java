package app.circadium.external.googlecalendar;

import app.circadium.external.ImportedCalendarEvent;
import java.time.Instant;
import java.util.List;

/** Google Calendar on the user's offline grant. Failures throw CalendarProviderException. */
public interface GoogleCalendarClient {

    /** Trades the authorization code for an offline grant; email is display-only. */
    TokenGrant exchangeCode(String code, String redirectUri);

    String refreshAccessToken(String refreshToken);

    /**
     * Best-effort: false when Google's grant could not be revoked (network failure or an
     * already-invalid token), so the caller can tell the user to remove access from their Google
     * account settings. The local token copy is deleted regardless.
     */
    boolean revokeToken(String refreshToken);

    List<CalendarEntry> listCalendars(String accessToken);

    /** The calendar's display summary, or null when it cannot be read. */
    String calendarSummary(String accessToken, String calendarId);

    List<ImportedCalendarEvent> fetchEvents(String accessToken, String calendarId, String sourceId,
            String userId, Instant windowStart, Instant windowEnd);

    record TokenGrant(String refreshToken, String email) {
    }

    record CalendarEntry(String id, String summary, String backgroundColor, boolean primary,
            String accessRole) {
    }
}
