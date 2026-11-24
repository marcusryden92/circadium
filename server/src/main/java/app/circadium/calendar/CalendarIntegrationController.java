package app.circadium.calendar;

import app.circadium.calendar.CalendarIntegrationService.ConnectionStatus;
import app.circadium.calendar.CalendarIntegrationService.GoogleDisconnectResult;
import app.circadium.calendar.CalendarIntegrationService.MicrosoftDisconnectResult;
import app.circadium.calendar.ExternalCalendarService.SourceWithEvents;
import app.circadium.external.googlecalendar.GoogleCalendarClient;
import app.circadium.external.microsoftgraph.MicrosoftGraphClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class CalendarIntegrationController {

    private final CalendarIntegrationService calendarIntegrationService;

    public record AddProviderSourceRequest(@NotBlank String calendarId, String name, String color) {
    }

    public record GoogleCalendarList(List<GoogleCalendarClient.CalendarEntry> calendars) {
    }

    public record MicrosoftCalendarList(List<MicrosoftGraphClient.CalendarEntry> calendars) {
    }

    @GetMapping("/integrations/google/status")
    @Operation(summary = "Google Calendar connection status")
    @ApiResponse(responseCode = "200", description = "Whether a connection exists, with its email")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public ConnectionStatus googleStatus(@AuthenticationPrincipal Jwt jwt) {
        return calendarIntegrationService.googleStatus(jwt.getSubject());
    }

    @GetMapping("/integrations/google/calendars")
    @Operation(summary = "The connected Google account's calendars",
            description = "Calendars the grant can at least read free/busy on.")
    @ApiResponse(responseCode = "200", description = "The calendar list")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "409", description = "No Google connection (code not_connected)")
    @ApiResponse(responseCode = "422", description = "Google refused (code provider_error)")
    public GoogleCalendarList googleCalendars(@AuthenticationPrincipal Jwt jwt) {
        return new GoogleCalendarList(calendarIntegrationService.listGoogleCalendars(jwt.getSubject()));
    }

    @PostMapping("/integrations/google/sources")
    @Operation(summary = "Add a Google calendar as a source",
            description = "Verifies access by fetching the window's events first, then writes "
                    + "source and events together.")
    @ApiResponse(responseCode = "200", description = "The created source and its events")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "409", description = "No Google connection (code not_connected) or "
            + "the calendar is already connected (code duplicate_source)")
    @ApiResponse(responseCode = "422", description = "Google refused (code provider_error)")
    public SourceWithEvents addGoogleSource(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody AddProviderSourceRequest request) {
        return calendarIntegrationService.addGoogleSource(jwt.getSubject(), request.calendarId(),
                request.name(), request.color());
    }

    @DeleteMapping("/integrations/google/connection")
    @Operation(summary = "Disconnect Google Calendar",
            description = "Revokes the grant best-effort and removes the GOOGLE sources with the "
                    + "connection; revoked=false means the user must remove access from their "
                    + "Google account settings themselves.")
    @ApiResponse(responseCode = "200", description = "The removed source ids and the revoke outcome")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public GoogleDisconnectResult disconnectGoogle(@AuthenticationPrincipal Jwt jwt) {
        return calendarIntegrationService.disconnectGoogle(jwt.getSubject());
    }

    @GetMapping("/integrations/microsoft/status")
    @Operation(summary = "Microsoft calendar connection status")
    @ApiResponse(responseCode = "200", description = "Whether a connection exists, with its email")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public ConnectionStatus microsoftStatus(@AuthenticationPrincipal Jwt jwt) {
        return calendarIntegrationService.microsoftStatus(jwt.getSubject());
    }

    @GetMapping("/integrations/microsoft/calendars")
    @Operation(summary = "The connected Microsoft account's calendars")
    @ApiResponse(responseCode = "200", description = "The calendar list")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "422", description = "No Microsoft connection or Microsoft refused "
            + "(code provider_error)")
    public MicrosoftCalendarList microsoftCalendars(@AuthenticationPrincipal Jwt jwt) {
        return new MicrosoftCalendarList(
                calendarIntegrationService.listMicrosoftCalendars(jwt.getSubject()));
    }

    @PostMapping("/integrations/microsoft/sources")
    @Operation(summary = "Add a Microsoft calendar as a source",
            description = "Verifies access by fetching the window's events first, then writes "
                    + "source and events together.")
    @ApiResponse(responseCode = "200", description = "The created source and its events")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "409", description = "The calendar is already connected "
            + "(code duplicate_source)")
    @ApiResponse(responseCode = "422", description = "No Microsoft connection or Microsoft refused "
            + "(code provider_error)")
    public SourceWithEvents addMicrosoftSource(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody AddProviderSourceRequest request) {
        return calendarIntegrationService.addMicrosoftSource(jwt.getSubject(), request.calendarId(),
                request.name(), request.color());
    }

    @DeleteMapping("/integrations/microsoft/connection")
    @Operation(summary = "Disconnect Microsoft calendars",
            description = "Deletes the local grant copy and the MICROSOFT sources; Microsoft "
                    + "exposes no revoke for consumer grants, so the UI points the user at their "
                    + "account's app permissions.")
    @ApiResponse(responseCode = "200", description = "The removed source ids")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public MicrosoftDisconnectResult disconnectMicrosoft(@AuthenticationPrincipal Jwt jwt) {
        return calendarIntegrationService.disconnectMicrosoft(jwt.getSubject());
    }
}
