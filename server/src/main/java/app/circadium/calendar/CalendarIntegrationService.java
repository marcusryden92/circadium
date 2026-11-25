package app.circadium.calendar;

import app.circadium.auth.AccountFlowException;
import app.circadium.external.googlecalendar.GoogleCalendarClient;
import app.circadium.external.microsoftgraph.MicrosoftGraphClient;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.ExternalCalendarSource;
import app.circadium.persistence.entity.GoogleCalendarConnection;
import app.circadium.persistence.entity.MicrosoftCalendarConnection;
import app.circadium.persistence.enums.ExternalCalendarKind;
import app.circadium.persistence.repository.ExternalCalendarSourceRepository;
import app.circadium.persistence.repository.GoogleCalendarConnectionRepository;
import app.circadium.persistence.repository.MicrosoftCalendarConnectionRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The Google and Microsoft calendar connections, ported from {@code actions/googleCalendar.ts}
 * and {@code actions/microsoftCalendar.ts}: connection status, the provider calendar lists,
 * adding an API-backed source, disconnecting, and the post-consent connection upserts. The
 * connections are deliberately independent of the sign-in provider — credentials users can
 * connect too. Nothing here moves {@code users.dataVersion}.
 */
@Service
@RequiredArgsConstructor
public class CalendarIntegrationService {

    private final GoogleCalendarConnectionRepository googleConnections;
    private final MicrosoftCalendarConnectionRepository microsoftConnections;
    private final ExternalCalendarSourceRepository sourceRepository;
    private final GoogleCalendarClient googleClient;
    private final MicrosoftGraphClient graphClient;
    private final ExternalCalendarService externalCalendarService;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    public record ConnectionStatus(boolean connected, String email) {
    }

    public record GoogleDisconnectResult(List<String> removedSourceIds, boolean revoked) {
    }

    public record MicrosoftDisconnectResult(List<String> removedSourceIds) {
    }

    @Transactional(readOnly = true)
    public ConnectionStatus googleStatus(String userId) {
        return googleConnections.findByUserId(userId)
                .map(connection -> new ConnectionStatus(true, connection.getEmail()))
                .orElseGet(() -> new ConnectionStatus(false, null));
    }

    @Transactional(readOnly = true)
    public ConnectionStatus microsoftStatus(String userId) {
        return microsoftConnections.findByUserId(userId)
                .map(connection -> new ConnectionStatus(true, connection.getEmail()))
                .orElseGet(() -> new ConnectionStatus(false, null));
    }

    public List<GoogleCalendarClient.CalendarEntry> listGoogleCalendars(String userId) {
        GoogleCalendarConnection connection = requireGoogleConnection(userId);
        String accessToken = googleClient.refreshAccessToken(connection.getRefreshToken());
        return googleClient.listCalendars(accessToken);
    }

    public List<MicrosoftGraphClient.CalendarEntry> listMicrosoftCalendars(String userId) {
        return graphClient.listCalendars(externalCalendarService.microsoftAccessToken(userId));
    }

    public ExternalCalendarService.SourceWithEvents addGoogleSource(String userId, String calendarId,
            String name, String color) {
        GoogleCalendarConnection connection = requireGoogleConnection(userId);
        return externalCalendarService.createGoogleSource(userId, connection, calendarId, name, color,
                null);
    }

    public ExternalCalendarService.SourceWithEvents addMicrosoftSource(String userId, String calendarId,
            String name, String color) {
        return externalCalendarService.createMicrosoftSource(userId, calendarId, name, color, null);
    }

    /**
     * Revokes the grant best-effort, then drops the GOOGLE sources and the connection together.
     * API-backed sources can't refresh without the grant; they go with it (events cascade with
     * each source row). A false {@code revoked} tells the user to remove access from their
     * Google account settings themselves.
     */
    public GoogleDisconnectResult disconnectGoogle(String userId) {
        Optional<GoogleCalendarConnection> connection = googleConnections.findByUserId(userId);
        if (connection.isEmpty()) {
            return new GoogleDisconnectResult(List.of(), true);
        }
        boolean revoked = googleClient.revokeToken(connection.get().getRefreshToken());
        List<String> removedSourceIds = transactionTemplate.execute(status -> {
            List<String> sourceIds = sourceRepository
                    .findByUserIdAndKind(userId, ExternalCalendarKind.GOOGLE).stream()
                    .map(ExternalCalendarSource::getId)
                    .toList();
            sourceRepository.deleteByUserIdAndKind(userId, ExternalCalendarKind.GOOGLE);
            googleConnections.deleteByUserId(userId);
            return sourceIds;
        });
        return new GoogleDisconnectResult(removedSourceIds, revoked);
    }

    /**
     * Microsoft exposes no revoke endpoint for consumer grants: the local token copy is deleted
     * (it ages out server-side), and the UI points the user at their Microsoft account's app
     * permissions for a hard revoke.
     */
    public MicrosoftDisconnectResult disconnectMicrosoft(String userId) {
        if (microsoftConnections.findByUserId(userId).isEmpty()) {
            return new MicrosoftDisconnectResult(List.of());
        }
        List<String> removedSourceIds = transactionTemplate.execute(status -> {
            List<String> sourceIds = sourceRepository
                    .findByUserIdAndKind(userId, ExternalCalendarKind.MICROSOFT).stream()
                    .map(ExternalCalendarSource::getId)
                    .toList();
            sourceRepository.deleteByUserIdAndKind(userId, ExternalCalendarKind.MICROSOFT);
            microsoftConnections.deleteByUserId(userId);
            return sourceIds;
        });
        return new MicrosoftDisconnectResult(removedSourceIds);
    }

    /**
     * A re-connect replaces the grant; the prior one is revoked first so it doesn't linger
     * authorized on the Google side.
     */
    @Transactional
    public void upsertGoogleConnection(String userId, String refreshToken, String email) {
        Instant now = DbTime.now(clock);
        GoogleCalendarConnection connection = googleConnections.findByUserId(userId).orElse(null);
        if (connection != null) {
            googleClient.revokeToken(connection.getRefreshToken());
        } else {
            connection = new GoogleCalendarConnection();
            connection.setId(UUID.randomUUID().toString());
            connection.setUserId(userId);
            connection.setCreatedAt(now);
        }
        connection.setRefreshToken(refreshToken);
        connection.setEmail(email);
        connection.setUpdatedAt(now);
        googleConnections.save(connection);
    }

    /**
     * A re-connect replaces the grant. Microsoft has no revoke endpoint for consumer grants; the
     * superseded refresh token ages out on its own.
     */
    @Transactional
    public void upsertMicrosoftConnection(String userId, String refreshToken, String email) {
        Instant now = DbTime.now(clock);
        MicrosoftCalendarConnection connection = microsoftConnections.findByUserId(userId).orElse(null);
        if (connection == null) {
            connection = new MicrosoftCalendarConnection();
            connection.setId(UUID.randomUUID().toString());
            connection.setUserId(userId);
            connection.setCreatedAt(now);
        }
        connection.setRefreshToken(refreshToken);
        connection.setEmail(email);
        connection.setUpdatedAt(now);
        microsoftConnections.save(connection);
    }

    private GoogleCalendarConnection requireGoogleConnection(String userId) {
        return googleConnections.findByUserId(userId)
                .orElseThrow(() -> new AccountFlowException(HttpStatus.CONFLICT, "not_connected",
                        "Google account not connected"));
    }
}
