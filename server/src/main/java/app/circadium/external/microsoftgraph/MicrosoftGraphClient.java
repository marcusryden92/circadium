package app.circadium.external.microsoftgraph;

import app.circadium.external.ImportedCalendarEvent;
import java.time.Instant;
import java.util.List;

/** Microsoft Graph on the user's offline grant. Failures throw CalendarProviderException. */
public interface MicrosoftGraphClient {

    /** Trades the authorization code for an offline grant; email is display-only. */
    TokenGrant exchangeCode(String code, String redirectUri);

    /**
     * Microsoft rotates refresh tokens: the response carries a NEW refresh token that invalidates
     * the old one on a rolling window. The caller MUST persist the returned refreshToken.
     */
    TokenPair refreshTokens(String refreshToken);

    List<CalendarEntry> listCalendars(String accessToken);

    /** The calendar's display name, or null when it cannot be read. */
    String calendarName(String accessToken, String calendarId);

    List<ImportedCalendarEvent> fetchEvents(String accessToken, String calendarId, String sourceId,
            String userId, Instant windowStart, Instant windowEnd);

    record TokenGrant(String refreshToken, String email) {
    }

    record TokenPair(String accessToken, String refreshToken) {
    }

    record CalendarEntry(String id, String name, String hexColor, boolean isDefault) {
    }
}
