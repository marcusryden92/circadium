package app.circadium.calendar;

import app.circadium.auth.AccountFlowException;
import app.circadium.external.CalendarProviderException;
import app.circadium.external.ImportedCalendarEvent;
import app.circadium.external.googlecalendar.GoogleCalendarClient;
import app.circadium.external.ics.IcsFeedException;
import app.circadium.external.ics.IcsFeedFetcher;
import app.circadium.external.ics.IcsParser;
import app.circadium.external.ics.IcsUrls;
import app.circadium.external.microsoftgraph.MicrosoftGraphClient;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.ExternalCalendarSource;
import app.circadium.persistence.entity.ExternalEvent;
import app.circadium.persistence.entity.GoogleCalendarConnection;
import app.circadium.persistence.entity.MicrosoftCalendarConnection;
import app.circadium.persistence.enums.ExternalCalendarKind;
import app.circadium.persistence.enums.ExternalCalendarMode;
import app.circadium.persistence.repository.ExternalCalendarSourceRepository;
import app.circadium.persistence.repository.ExternalEventRepository;
import app.circadium.persistence.repository.GoogleCalendarConnectionRepository;
import app.circadium.persistence.repository.LocationRepository;
import app.circadium.persistence.repository.MicrosoftCalendarConnectionRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.ErrorResponseException;

/**
 * The external-calendar surface, ported from {@code actions/externalCalendars.ts} and the
 * server-only halves of {@code utils/external-calendar/}: subscribed ICS feeds (with the Google
 * sharing-link resolution), GOOGLE and MICROSOFT API-backed sources, the wholesale-replace
 * refresh, and the per-event busy and location overrides. Everything lives OUTSIDE the OCC diff
 * sync — nothing here moves {@code users.dataVersion}. Error messages are user-facing contract:
 * they flow verbatim into the UI status line and the source row's {@code lastError}.
 */
@Service
@RequiredArgsConstructor
public class ExternalCalendarService {

    /** How far a refresh materializes occurrences (refreshPolicy.ts). */
    static final int PAST_WINDOW_DAYS = 30;
    static final int FUTURE_WINDOW_DAYS = 180;

    private static final int MAX_FEED_CHARS = 10_000_000;
    private static final Pattern VCALENDAR = Pattern.compile("BEGIN:VCALENDAR", Pattern.CASE_INSENSITIVE);
    private static final Pattern HTML_PAGE = Pattern.compile("<(!doctype|html)", Pattern.CASE_INSENSITIVE);

    private final ExternalCalendarSourceRepository sourceRepository;
    private final ExternalEventRepository eventRepository;
    private final GoogleCalendarConnectionRepository googleConnections;
    private final MicrosoftCalendarConnectionRepository microsoftConnections;
    private final LocationRepository locationRepository;
    private final GoogleCalendarClient googleClient;
    private final MicrosoftGraphClient graphClient;
    private final IcsFeedFetcher icsFeedFetcher;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    public record SourceWire(String id, String userId, ExternalCalendarKind kind, String url, String name,
            String color, boolean enabled, ExternalCalendarMode mode, String modeExceptions,
            String locationId, String locationExceptions, Instant lastFetchedAt, String lastError,
            Instant createdAt, Instant updatedAt) {
    }

    public record CalendarData(List<SourceWire> sources, List<ImportedCalendarEvent> events) {
    }

    public record SourceWithEvents(SourceWire source, List<ImportedCalendarEvent> events) {
    }

    @Transactional(readOnly = true)
    public CalendarData fetchData(String userId) {
        List<SourceWire> sources = sourceRepository.findByUserId(userId).stream()
                .map(ExternalCalendarService::toWire)
                .toList();
        List<ImportedCalendarEvent> events = eventRepository.findByUserId(userId).stream()
                .map(ExternalCalendarService::toWire)
                .toList();
        return new CalendarData(sources, events);
    }

    /**
     * Adds a source from a pasted URL. A Google sharing link is an HTML page, not a feed: with a
     * connected Google account the calendar id resolves through the API (covers coworker/room
     * calendars shared with that account); otherwise the calendar's public feed is tried, and
     * failing that the error names the exact fix.
     */
    public SourceWithEvents addFromUrl(String rawUrl, String name, String color, ExternalCalendarMode mode,
            String userId) {
        String url = IcsUrls.normalize(rawUrl);
        if (url == null) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_url",
                    "That doesn't look like a valid URL");
        }

        String shareCalendarId = IcsUrls.googleShareLinkCalendarId(url);
        if (shareCalendarId == null) {
            return createIcsSource(userId, url, fetchIcsText(url), name, color, mode);
        }

        Optional<GoogleCalendarConnection> connection = googleConnections.findByUserId(userId);
        if (connection.isPresent()) {
            try {
                return createGoogleSource(userId, connection.get(), shareCalendarId, name, color, mode);
            } catch (RuntimeException e) {
                // The connected account can't read it — the public feed may still.
            }
        }
        String publicUrl = IcsUrls.googlePublicIcsUrl(shareCalendarId);
        String icsText;
        try {
            icsText = fetchIcsText(publicUrl);
        } catch (RuntimeException e) {
            throw new AccountFlowException(HttpStatus.UNPROCESSABLE_ENTITY, "feed_error",
                    connection.isPresent()
                            ? "That's a Google Calendar sharing link, but neither your connected Google"
                                    + " account nor the public feed can read that calendar. Ask the owner"
                                    + " to share it with your Google account, or paste the calendar's"
                                    + " “Secret address in iCal format”."
                            : "That's a Google Calendar sharing link, and this calendar isn't public."
                                    + " Either connect your Google account under Connected calendars"
                                    + " (works for calendars shared with you), or — for your own"
                                    + " calendar — copy the “Secret address in iCal format”"
                                    + " from Google Calendar's settings and paste that .ics link here.");
        }
        return createIcsSource(userId, publicUrl, icsText, name, color, mode);
    }

    /**
     * Wholesale event replace: fetch per kind, then swap the source's events in one transaction
     * and clear {@code lastError}. A fetch failure writes {@code lastError} and answers 422 with
     * the updated source riding the ProblemDetail (code {@code refresh_failed}) — the retired
     * action's error-with-body shape, which the client mirrors into its store.
     */
    public SourceWithEvents refresh(String userId, String sourceId) {
        ExternalCalendarSource source = requireSource(userId, sourceId);
        Instant now = DbTime.now(clock);
        Instant windowStart = now.minus(Duration.ofDays(PAST_WINDOW_DAYS));
        Instant windowEnd = now.plus(Duration.ofDays(FUTURE_WINDOW_DAYS));

        List<ImportedCalendarEvent> events;
        try {
            events = switch (source.getKind()) {
                case GOOGLE -> {
                    GoogleCalendarConnection connection = googleConnections.findByUserId(userId)
                            .orElseThrow(() -> new CalendarProviderException(
                                    "Google account disconnected — reconnect it under Connected calendars"));
                    String accessToken = googleClient.refreshAccessToken(connection.getRefreshToken());
                    yield googleClient.fetchEvents(accessToken, source.getUrl(), source.getId(), userId,
                            windowStart, windowEnd);
                }
                case MICROSOFT -> graphClient.fetchEvents(microsoftAccessToken(userId), source.getUrl(),
                        source.getId(), userId, windowStart, windowEnd);
                case ICS -> IcsParser.parse(fetchIcsText(source.getUrl()), source.getId(), userId,
                        windowStart, windowEnd).events();
            };
        } catch (IcsFeedException | CalendarProviderException e) {
            source.setLastError(e.getMessage());
            source.setUpdatedAt(now);
            sourceRepository.save(source);
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY,
                    e.getMessage());
            problem.setProperty("code", "refresh_failed");
            problem.setProperty("source", toWire(source));
            // No cause: the resolver would unwrap to it and hand the response to the generic
            // feed/provider advice, losing the source the client mirrors into its store.
            throw new ErrorResponseException(HttpStatus.UNPROCESSABLE_ENTITY, problem, null);
        }

        transactionTemplate.executeWithoutResult(status -> {
            // Plain SQL on both sides: a repository delete would defer to the flush and collide
            // with the insert on any event id the refresh kept.
            jdbcTemplate.update("DELETE FROM \"ExternalEvents\" WHERE \"sourceId\" = ?", source.getId());
            insertEvents(events);
            source.setLastFetchedAt(now);
            source.setLastError(null);
            source.setUpdatedAt(now);
            sourceRepository.save(source);
        });
        return new SourceWithEvents(toWire(source), events);
    }

    @Transactional
    public SourceWire update(String userId, String sourceId, String name, boolean colorSet, String color,
            ExternalCalendarMode mode, Boolean enabled, boolean locationIdSet, String locationId) {
        ExternalCalendarSource source = requireSource(userId, sourceId);
        if (name != null) {
            source.setName(name);
        }
        if (colorSet) {
            source.setColor(color);
        }
        if (mode != null) {
            source.setMode(mode);
        }
        if (enabled != null) {
            source.setEnabled(enabled);
        }
        if (locationIdSet) {
            requireOwnLocation(userId, locationId);
            source.setLocationId(locationId);
        }
        source.setUpdatedAt(DbTime.now(clock));
        sourceRepository.save(source);
        return toWire(source);
    }

    /** Events cascade with the source row. A missing or foreign id answers 404. */
    @Transactional
    public void delete(String userId, String sourceId) {
        if (sourceRepository.deleteByIdAndUserId(sourceId, userId) == 0) {
            throw sourceNotFound();
        }
    }

    @Transactional
    public SourceWire toggleBusyException(String userId, String sourceId, String uid) {
        ExternalCalendarSource source = requireSource(userId, sourceId);
        source.setModeExceptions(ExternalSourceExceptions.toggleModeException(source.getModeExceptions(), uid));
        source.setUpdatedAt(DbTime.now(clock));
        sourceRepository.save(source);
        return toWire(source);
    }

    /**
     * Per-event location override, keyed by series UID (survives refresh). Inherit drops the
     * override so the event falls back to the source default; otherwise the event is pinned to
     * the given location (null = Anywhere).
     */
    @Transactional
    public SourceWire setEventLocation(String userId, String sourceId, String uid, boolean inherit,
            String locationId) {
        ExternalCalendarSource source = requireSource(userId, sourceId);
        if (inherit) {
            source.setLocationExceptions(
                    ExternalSourceExceptions.clearLocationException(source.getLocationExceptions(), uid));
        } else {
            requireOwnLocation(userId, locationId);
            source.setLocationExceptions(
                    ExternalSourceExceptions.setLocationException(source.getLocationExceptions(), uid,
                            locationId));
        }
        source.setUpdatedAt(DbTime.now(clock));
        sourceRepository.save(source);
        return toWire(source);
    }

    /**
     * Creates a GOOGLE-kind source for a calendar the connected account can read: access is
     * verified by fetching the window's events first (the source id is minted ahead so the
     * deterministic event ids can reference it), then source and events are written in one
     * transaction.
     */
    public SourceWithEvents createGoogleSource(String userId, GoogleCalendarConnection connection,
            String calendarId, String name, String color, ExternalCalendarMode mode) {
        requireNotConnected(userId, ExternalCalendarKind.GOOGLE, calendarId);

        String accessToken = googleClient.refreshAccessToken(connection.getRefreshToken());
        Instant now = DbTime.now(clock);
        String sourceId = UUID.randomUUID().toString();
        List<ImportedCalendarEvent> events = googleClient.fetchEvents(accessToken, calendarId, sourceId,
                userId, now.minus(Duration.ofDays(PAST_WINDOW_DAYS)),
                now.plus(Duration.ofDays(FUTURE_WINDOW_DAYS)));
        // Short-circuit like the TS chain: the picker always supplies a name, so the metadata
        // call must not run (or fail the add) when one is present.
        String finalName = isBlank(name)
                ? providerNameOrId(googleClient.calendarSummary(accessToken, calendarId), calendarId)
                : JsText.trim(name);

        return persistSource(sourceId, userId, ExternalCalendarKind.GOOGLE, calendarId, finalName, color,
                mode, now, events);
    }

    /** The MICROSOFT counterpart of {@link #createGoogleSource}. */
    public SourceWithEvents createMicrosoftSource(String userId, String calendarId, String name,
            String color, ExternalCalendarMode mode) {
        requireNotConnected(userId, ExternalCalendarKind.MICROSOFT, calendarId);

        String accessToken = microsoftAccessToken(userId);
        Instant now = DbTime.now(clock);
        String sourceId = UUID.randomUUID().toString();
        List<ImportedCalendarEvent> events = graphClient.fetchEvents(accessToken, calendarId, sourceId,
                userId, now.minus(Duration.ofDays(PAST_WINDOW_DAYS)),
                now.plus(Duration.ofDays(FUTURE_WINDOW_DAYS)));
        String finalName = isBlank(name)
                ? providerNameOrId(graphClient.calendarName(accessToken, calendarId), calendarId)
                : JsText.trim(name);

        return persistSource(sourceId, userId, ExternalCalendarKind.MICROSOFT, calendarId, finalName, color,
                mode, now, events);
    }

    /**
     * A fresh Graph access token for the user's connection, persisting the rotated refresh token
     * Microsoft returns — the old one invalidates on a rolling window, so skipping the write
     * would strand the grant. The write commits on its own, before whatever the token is for.
     */
    public String microsoftAccessToken(String userId) {
        MicrosoftCalendarConnection connection = microsoftConnections.findByUserId(userId)
                .orElseThrow(() -> new CalendarProviderException(
                        "Microsoft account disconnected — reconnect it under Connected calendars"));
        MicrosoftGraphClient.TokenPair tokens = graphClient.refreshTokens(connection.getRefreshToken());
        if (!tokens.refreshToken().equals(connection.getRefreshToken())) {
            connection.setRefreshToken(tokens.refreshToken());
            connection.setUpdatedAt(DbTime.now(clock));
            microsoftConnections.save(connection);
        }
        return tokens.accessToken();
    }

    private SourceWithEvents createIcsSource(String userId, String url, String icsText, String name,
            String color, ExternalCalendarMode mode) {
        Instant now = DbTime.now(clock);
        // The id is minted before the parse so the deterministic event ids can reference it, and
        // nothing is written until the feed parsed — a bad feed must not leave an orphaned source
        // row (the retired action created the row first and leaked one on a parse failure).
        String sourceId = UUID.randomUUID().toString();
        IcsParser.Result parsed = IcsParser.parse(icsText, sourceId, userId,
                now.minus(Duration.ofDays(PAST_WINDOW_DAYS)), now.plus(Duration.ofDays(FUTURE_WINDOW_DAYS)));
        String finalName = firstNonBlank(name, parsed.calendarName(), "Imported calendar");

        return persistSource(sourceId, userId, ExternalCalendarKind.ICS, url, finalName, color, mode, now,
                parsed.events());
    }

    private SourceWithEvents persistSource(String sourceId, String userId, ExternalCalendarKind kind,
            String url, String name, String color, ExternalCalendarMode mode, Instant now,
            List<ImportedCalendarEvent> events) {
        ExternalCalendarSource source = new ExternalCalendarSource();
        source.setId(sourceId);
        source.setUserId(userId);
        source.setKind(kind);
        source.setUrl(url);
        source.setName(name);
        source.setColor(color);
        source.setEnabled(true);
        source.setMode(mode == null ? ExternalCalendarMode.BUSY : mode);
        source.setLastFetchedAt(now);
        source.setCreatedAt(now);
        source.setUpdatedAt(now);

        transactionTemplate.executeWithoutResult(status -> {
            // Flushed, not just saved: the event insert below runs as plain SQL in the same
            // transaction and needs the source row on disk for its foreign key.
            sourceRepository.saveAndFlush(source);
            insertEvents(events);
        });
        return new SourceWithEvents(toWire(source), events);
    }

    private void requireNotConnected(String userId, ExternalCalendarKind kind, String calendarId) {
        sourceRepository.findFirstByUserIdAndKindAndUrl(userId, kind, calendarId).ifPresent(existing -> {
            throw new AccountFlowException(HttpStatus.CONFLICT, "duplicate_source",
                    "\"" + existing.getName() + "\" is already connected");
        });
    }

    private String fetchIcsText(String url) {
        String text = icsFeedFetcher.fetch(url);
        if (text.length() > MAX_FEED_CHARS) {
            throw new IcsFeedException("The feed is too large to import");
        }
        if (!VCALENDAR.matcher(text).find()) {
            throw new IcsFeedException(HTML_PAGE.matcher(text).find()
                    ? "The URL returned a web page, not a calendar feed — look for a link ending"
                            + " in .ics (in Google Calendar: the “Secret address in iCal format”)"
                    : "The URL did not return an ICS calendar feed");
        }
        return text;
    }

    private void insertEvents(List<ImportedCalendarEvent> events) {
        jdbcTemplate.batchUpdate("INSERT INTO \"ExternalEvents\""
                + " (\"id\", \"sourceId\", \"userId\", \"uid\", \"title\", \"start\", \"end\", \"allDay\")"
                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?)", events, 200, (statement, event) -> {
                    statement.setString(1, event.id());
                    statement.setString(2, event.sourceId());
                    statement.setString(3, event.userId());
                    statement.setString(4, event.uid());
                    statement.setString(5, event.title());
                    statement.setString(6, event.start());
                    statement.setString(7, event.end());
                    statement.setBoolean(8, event.allDay());
                });
    }

    private ExternalCalendarSource requireSource(String userId, String sourceId) {
        return sourceRepository.findByIdAndUserId(sourceId, userId)
                .orElseThrow(ExternalCalendarService::sourceNotFound);
    }

    private void requireOwnLocation(String userId, String locationId) {
        if (locationId != null && locationRepository.findByIdAndUserId(locationId, userId).isEmpty()) {
            throw new AccountFlowException(HttpStatus.NOT_FOUND, "location_not_found", "Location not found");
        }
    }

    private static AccountFlowException sourceNotFound() {
        return new AccountFlowException(HttpStatus.NOT_FOUND, "calendar_not_found", "Calendar not found");
    }

    private static boolean isBlank(String value) {
        return value == null || JsText.isBlank(value);
    }

    /** The TS ICS chain trimmed every link with JS trim(); a blank one falls through. */
    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (!isBlank(value)) {
                return JsText.trim(value);
            }
        }
        throw new IllegalArgumentException("No fallback value provided");
    }

    /**
     * The TS provider chains kept the fetched display name verbatim — whitespace-only is truthy
     * in JS and wins over the calendar id; only null or empty falls through.
     */
    private static String providerNameOrId(String providerValue, String calendarId) {
        return providerValue == null || providerValue.isEmpty() ? calendarId : providerValue;
    }

    static SourceWire toWire(ExternalCalendarSource source) {
        return new SourceWire(source.getId(), source.getUserId(), source.getKind(), source.getUrl(),
                source.getName(), source.getColor(), source.isEnabled(), source.getMode(),
                source.getModeExceptions(), source.getLocationId(), source.getLocationExceptions(),
                source.getLastFetchedAt(), source.getLastError(), source.getCreatedAt(),
                source.getUpdatedAt());
    }

    private static ImportedCalendarEvent toWire(ExternalEvent event) {
        return new ImportedCalendarEvent(event.getId(), event.getSourceId(), event.getUserId(),
                event.getUid(), event.getTitle(), event.getStart(), event.getEnd(), event.isAllDay());
    }
}
