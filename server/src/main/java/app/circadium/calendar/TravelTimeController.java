package app.circadium.calendar;

import app.circadium.calendar.CalendarContracts.SerializedTravelTime;
import app.circadium.calendar.TravelTimeService.FetchMissingOutcome;
import app.circadium.calendar.TravelTimeService.RefreshAllOutcome;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import app.circadium.persistence.enums.TransportMode;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class TravelTimeController {

    private final TravelTimeService travelTimeService;

    public record TravelTimeRequest(@NotNull TransportMode transportMode) {
    }

    /** Counts plus the account's fresh rows, so the client needs no follow-up read. */
    public record FetchMissingResponse(int fetched, int skipped, int failed,
            List<SerializedTravelTime> travelTimes) {
    }

    public record RefreshAllResponse(int updated, int failed, List<SerializedTravelTime> travelTimes) {
    }

    @PostMapping("/travel-times/fetch-missing")
    @Operation(summary = "Buy travel times for pairs with no fresh row",
            description = "Fresh means inside the 180-day TTL, or inside the 30-day retry window for "
                    + "a pair Google could not route. Reserves the account-global monthly element "
                    + "budget before calling Google.")
    @ApiResponse(responseCode = "200", description = "Counts and the account's travel-time rows")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "409", description = "The monthly budget is used up (code travel_budget)")
    @ApiResponse(responseCode = "503", description = "No Google Maps key configured (code maps_not_configured)")
    public FetchMissingResponse fetchMissing(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody TravelTimeRequest request) {
        String userId = jwt.getSubject();
        FetchMissingOutcome outcome = travelTimeService.fetchMissing(userId, request.transportMode());
        return new FetchMissingResponse(outcome.fetched(), outcome.skipped(), outcome.failed(),
                travelTimeService.serializedRows(userId));
    }

    @PostMapping("/travel-times/refresh-all")
    @Operation(summary = "Re-buy the whole travel-time grid for a mode",
            description = "The most expensive call in the app, behind two hour gates: the action "
                    + "itself, and the staleness of the mode's oldest row. Custom overrides survive.")
    @ApiResponse(responseCode = "200", description = "Counts and the account's travel-time rows")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "409", description = "A gate refused (code refresh_gate) or the monthly "
            + "budget is used up (code travel_budget)")
    @ApiResponse(responseCode = "503", description = "No Google Maps key configured (code maps_not_configured)")
    public RefreshAllResponse refreshAll(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody TravelTimeRequest request) {
        String userId = jwt.getSubject();
        RefreshAllOutcome outcome = travelTimeService.refreshAll(userId, request.transportMode());
        return new RefreshAllResponse(outcome.updated(), outcome.failed(),
                travelTimeService.serializedRows(userId));
    }
}
