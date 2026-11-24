package app.circadium.external.googlecalendar;

import app.circadium.external.CalendarProviderException;
import app.circadium.external.ImportedCalendarEvent;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Canned Google answers. Access tokens are minted as {@code access:<refreshToken>} so tests can
 * assert which grant a call rode on; raw API events per calendar run through the real mapper.
 */
public class FakeGoogleCalendarClient implements GoogleCalendarClient {

    public final Map<String, TokenGrant> grantByCode = new HashMap<>();
    public final Map<String, List<GoogleEventMapper.ApiEvent>> eventsByCalendarId = new HashMap<>();
    public final Map<String, String> summaryByCalendarId = new HashMap<>();
    public final List<CalendarEntry> calendars = new ArrayList<>();
    public final List<String> revokedTokens = new ArrayList<>();

    public CalendarProviderException refreshFailure;
    public CalendarProviderException fetchFailure;
    public boolean revokeAnswer = true;

    public void reset() {
        grantByCode.clear();
        eventsByCalendarId.clear();
        summaryByCalendarId.clear();
        calendars.clear();
        revokedTokens.clear();
        refreshFailure = null;
        fetchFailure = null;
        revokeAnswer = true;
    }

    @Override
    public TokenGrant exchangeCode(String code, String redirectUri) {
        TokenGrant grant = grantByCode.get(code);
        if (grant == null) {
            throw new CalendarProviderException("Google token exchange failed (400)");
        }
        return grant;
    }

    @Override
    public String refreshAccessToken(String refreshToken) {
        if (refreshFailure != null) {
            throw refreshFailure;
        }
        return "access:" + refreshToken;
    }

    @Override
    public boolean revokeToken(String refreshToken) {
        revokedTokens.add(refreshToken);
        return revokeAnswer;
    }

    @Override
    public List<CalendarEntry> listCalendars(String accessToken) {
        return List.copyOf(calendars);
    }

    @Override
    public String calendarSummary(String accessToken, String calendarId) {
        return summaryByCalendarId.get(calendarId);
    }

    @Override
    public List<ImportedCalendarEvent> fetchEvents(String accessToken, String calendarId, String sourceId,
            String userId, Instant windowStart, Instant windowEnd) {
        if (fetchFailure != null) {
            throw fetchFailure;
        }
        List<GoogleEventMapper.ApiEvent> items = eventsByCalendarId.get(calendarId);
        if (items == null) {
            throw new CalendarProviderException("Google couldn't find that calendar for your account");
        }
        return GoogleEventMapper.map(items, sourceId, userId, windowStart, windowEnd);
    }
}
