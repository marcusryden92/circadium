package app.circadium.calendar;

import app.circadium.calendar.ExternalCalendarService.CalendarData;
import app.circadium.calendar.ExternalCalendarService.SourceWire;
import app.circadium.calendar.ExternalCalendarService.SourceWithEvents;
import app.circadium.persistence.enums.ExternalCalendarMode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class ExternalCalendarController {

    private final ExternalCalendarService externalCalendarService;

    /**
     * The nullable columns distinguish "leave unchanged" from "clear" with the habit surface's
     * PatchField: an absent or unset field means untouched.
     */
    public record PatchField(boolean set, String value) {

        static boolean isSet(PatchField field) {
            return field != null && field.set();
        }

        static String value(PatchField field) {
            return field == null ? null : field.value();
        }
    }

    /** url is deliberately unvalidated here: a blank one must answer the TS invalid-URL string. */
    public record AddSourceRequest(String url, String name, String color, ExternalCalendarMode mode) {
    }

    public record UpdateSourceRequest(String name, PatchField color, ExternalCalendarMode mode,
            Boolean enabled, PatchField locationId) {
    }

    public record BusyExceptionRequest(@NotBlank String uid) {
    }

    /** Inherit drops the per-event override; otherwise locationId pins it (null = Anywhere). */
    public record EventLocationRequest(@NotBlank String uid, boolean inherit, String locationId) {
    }

    @GetMapping("/external-calendars")
    @Operation(summary = "All external-calendar sources and their materialized events",
            description = "The hydrate read the client mirrors into its store on load.")
    @ApiResponse(responseCode = "200", description = "Sources and events")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public CalendarData fetch(@AuthenticationPrincipal Jwt jwt) {
        return externalCalendarService.fetchData(jwt.getSubject());
    }

    @PostMapping("/external-calendars")
    @Operation(summary = "Subscribe to a calendar by URL",
            description = "Accepts https:// and webcal:// ICS feeds. A Google sharing link resolves "
                    + "through a connected Google account or the calendar's public feed; error "
                    + "messages name the exact fix and flow verbatim into the UI.")
    @ApiResponse(responseCode = "200", description = "The created source and its events")
    @ApiResponse(responseCode = "400", description = "Not a usable URL (code invalid_url)")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "409", description = "The calendar is already connected "
            + "(code duplicate_source)")
    @ApiResponse(responseCode = "422", description = "The feed could not be fetched or read "
            + "(code feed_error)")
    public SourceWithEvents add(@AuthenticationPrincipal Jwt jwt,
            @RequestBody AddSourceRequest request) {
        return externalCalendarService.addFromUrl(request.url(), request.name(), request.color(),
                request.mode(), jwt.getSubject());
    }

    @PostMapping("/external-calendars/{sourceId}/refresh")
    @Operation(summary = "Refresh one source",
            description = "Re-fetches the source's window and replaces its events wholesale, "
                    + "clearing lastError. A fetch failure writes lastError and answers 422 with "
                    + "the updated source riding the problem body (property source).")
    @ApiResponse(responseCode = "200", description = "The refreshed source and its events")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "Not the caller's source (code calendar_not_found)")
    @ApiResponse(responseCode = "422", description = "The fetch failed (code refresh_failed; the "
            + "problem body carries the source with lastError set)")
    public SourceWithEvents refresh(@AuthenticationPrincipal Jwt jwt, @PathVariable String sourceId) {
        return externalCalendarService.refresh(jwt.getSubject(), sourceId);
    }

    @PatchMapping("/external-calendars/{sourceId}")
    @Operation(summary = "Update a source's display and scheduling settings",
            description = "Partial update of name, color, mode, enabled and the default location.")
    @ApiResponse(responseCode = "200", description = "The source after the write")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "Not the caller's source (code calendar_not_found) "
            + "or not the caller's location (code location_not_found)")
    public SourceWire update(@AuthenticationPrincipal Jwt jwt, @PathVariable String sourceId,
            @RequestBody UpdateSourceRequest request) {
        return externalCalendarService.update(jwt.getSubject(), sourceId, request.name(),
                PatchField.isSet(request.color()), PatchField.value(request.color()), request.mode(),
                request.enabled(), PatchField.isSet(request.locationId()),
                PatchField.value(request.locationId()));
    }

    @DeleteMapping("/external-calendars/{sourceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Remove a source", description = "Its events cascade with it.")
    @ApiResponse(responseCode = "204", description = "Removed")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "Not the caller's source (code calendar_not_found)")
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String sourceId) {
        externalCalendarService.delete(jwt.getSubject(), sourceId);
    }

    @PostMapping("/external-calendars/{sourceId}/busy-exception")
    @Operation(summary = "Flip one event's busy behavior",
            description = "Toggles the UID in the source's modeExceptions, flipping that series "
                    + "against the source's BUSY/VISUAL default.")
    @ApiResponse(responseCode = "200", description = "The source after the write")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "Not the caller's source (code calendar_not_found)")
    public SourceWire toggleBusyException(@AuthenticationPrincipal Jwt jwt, @PathVariable String sourceId,
            @Valid @RequestBody BusyExceptionRequest request) {
        return externalCalendarService.toggleBusyException(jwt.getSubject(), sourceId, request.uid());
    }

    @PutMapping("/external-calendars/{sourceId}/event-location")
    @Operation(summary = "Override one event's location",
            description = "Keyed by series UID so the override survives refreshes. Inherit drops "
                    + "the override; otherwise the event pins to the location (null = Anywhere).")
    @ApiResponse(responseCode = "200", description = "The source after the write")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "Not the caller's source (code calendar_not_found) "
            + "or not the caller's location (code location_not_found)")
    public SourceWire setEventLocation(@AuthenticationPrincipal Jwt jwt, @PathVariable String sourceId,
            @Valid @RequestBody EventLocationRequest request) {
        return externalCalendarService.setEventLocation(jwt.getSubject(), sourceId, request.uid(),
                request.inherit(), request.locationId());
    }
}
