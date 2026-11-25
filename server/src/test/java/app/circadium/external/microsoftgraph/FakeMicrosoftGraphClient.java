package app.circadium.external.microsoftgraph;

import app.circadium.external.CalendarProviderException;
import app.circadium.external.ImportedCalendarEvent;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Canned Microsoft answers. Refresh ROTATES by default — each call returns
 * {@code <token>+rot} — because persisting the rotated token is exactly what the
 * production code must get right.
 */
public class FakeMicrosoftGraphClient implements MicrosoftGraphClient {

    public final Map<String, TokenGrant> grantByCode = new HashMap<>();
    public final Map<String, List<GraphEventMapper.ApiEvent>> eventsByCalendarId = new HashMap<>();
    public final Map<String, String> nameByCalendarId = new HashMap<>();
    public final List<CalendarEntry> calendars = new ArrayList<>();

    public CalendarProviderException refreshFailure;
    public CalendarProviderException fetchFailure;
    public boolean rotateOnRefresh = true;

    public void reset() {
        grantByCode.clear();
        eventsByCalendarId.clear();
        nameByCalendarId.clear();
        calendars.clear();
        refreshFailure = null;
        fetchFailure = null;
        rotateOnRefresh = true;
    }

    @Override
    public TokenGrant exchangeCode(String code, String redirectUri) {
        TokenGrant grant = grantByCode.get(code);
        if (grant == null) {
            throw new CalendarProviderException("Microsoft token exchange failed (400)");
        }
        return grant;
    }

    @Override
    public TokenPair refreshTokens(String refreshToken) {
        if (refreshFailure != null) {
            throw refreshFailure;
        }
        String nextRefreshToken = rotateOnRefresh ? refreshToken + "+rot" : refreshToken;
        return new TokenPair("access:" + refreshToken, nextRefreshToken);
    }

    @Override
    public List<CalendarEntry> listCalendars(String accessToken) {
        return List.copyOf(calendars);
    }

    @Override
    public String calendarName(String accessToken, String calendarId) {
        return nameByCalendarId.get(calendarId);
    }

    @Override
    public List<ImportedCalendarEvent> fetchEvents(String accessToken, String calendarId, String sourceId,
            String userId, Instant windowStart, Instant windowEnd) {
        if (fetchFailure != null) {
            throw fetchFailure;
        }
        List<GraphEventMapper.ApiEvent> items = eventsByCalendarId.get(calendarId);
        if (items == null) {
            throw new CalendarProviderException("Microsoft couldn't find that calendar for your account");
        }
        return GraphEventMapper.map(items, sourceId, userId, windowStart, windowEnd);
    }
}
