package app.circadium.calendar;

import app.circadium.calendar.CalendarContracts.SchedulingPreferences;
import app.circadium.persistence.enums.TransportMode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class SchedulingPreferencesController {

    private final SchedulingPreferencesService preferencesService;

    /** A partial update: only the provided fields change. Reads come with the calendar bootstrap. */
    public record UpdateSchedulingPreferencesRequest(
            @Min(0) @Max(1440) Integer bufferTimeMinutes,
            @Schema(description = "0 = Sunday through 6 = Saturday.")
            @Min(0) @Max(6) Integer weekStartDay,
            TransportMode defaultTransportMode) {

        @AssertTrue(message = "At least one preference must be provided.")
        @Schema(hidden = true)
        public boolean isAnyPreferenceProvided() {
            return bufferTimeMinutes != null || weekStartDay != null || defaultTransportMode != null;
        }
    }

    @PatchMapping("/scheduling/preferences")
    @Operation(summary = "Change the caller's scheduling preferences",
            description = "Patches only the provided fields; the first write creates the row with column "
                    + "defaults for the rest. Outside the sync diff, so it never moves dataVersion.")
    @ApiResponse(responseCode = "200", description = "The preferences after the write")
    @ApiResponse(responseCode = "400", description = "No field provided, or a value out of range")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public SchedulingPreferences update(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateSchedulingPreferencesRequest request) {
        return preferencesService.update(jwt.getSubject(), request.bufferTimeMinutes(),
                request.weekStartDay(), request.defaultTransportMode());
    }
}
