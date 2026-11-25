package app.circadium.calendar;

import app.circadium.calendar.CalendarContracts.SerializedLocation;
import app.circadium.external.maps.PlacesClient.PlacePrediction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class LocationController {

    private final LocationService locationService;

    public record SearchPlacesRequest(@NotBlank String query, String sessionToken) {
    }

    public record CreateLocationRequest(@NotBlank String name, @NotBlank String placeId,
            String sessionToken) {
    }

    /** A null name or placeId leaves that field unchanged (the TS partial-update shape). */
    public record UpdateLocationRequest(String name, String placeId, String sessionToken) {
    }

    @PostMapping("/locations/search")
    @Operation(summary = "Address autocomplete",
            description = "Google Places (New) predictions for the query; the session token threads "
                    + "a keystroke burst and its closing details call into one billing session.")
    @ApiResponse(responseCode = "200", description = "Predictions, possibly empty")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "429", description = "Too many searches this minute (code search_throttled)")
    @ApiResponse(responseCode = "503", description = "No Google Maps key configured (code maps_not_configured)")
    public List<PlacePrediction> search(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody SearchPlacesRequest request) {
        return locationService.search(jwt.getSubject(), request.query(), request.sessionToken());
    }

    @PostMapping("/locations")
    @Operation(summary = "Add a location",
            description = "Resolves the place server-side (address, coordinates) and creates the row. "
                    + "Creation cannot ride the sync diff: the id is server-minted and the lookup "
                    + "needs the Places key.")
    @ApiResponse(responseCode = "200", description = "The created location")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "409", description = "The location cap is reached (code location_limit) "
            + "or the place is already added (code duplicate_place)")
    @ApiResponse(responseCode = "503", description = "No Google Maps key configured (code maps_not_configured)")
    public SerializedLocation create(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateLocationRequest request) {
        return locationService.create(jwt.getSubject(), request.name(), request.placeId(),
                request.sessionToken());
    }

    @PatchMapping("/locations/{locationId}")
    @Operation(summary = "Rename a location or move it to another place",
            description = "A place change refetches the address and coordinates and drops every cached "
                    + "travel time touching the location, so the matrix re-buys on demand.")
    @ApiResponse(responseCode = "200", description = "The location after the write")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "Not the caller's location (code location_not_found)")
    @ApiResponse(responseCode = "409", description = "Another location already uses the place "
            + "(code duplicate_place)")
    public SerializedLocation update(@AuthenticationPrincipal Jwt jwt, @PathVariable String locationId,
            @Valid @RequestBody UpdateLocationRequest request) {
        return locationService.update(jwt.getSubject(), locationId, request.name(), request.placeId(),
                request.sessionToken());
    }
}
