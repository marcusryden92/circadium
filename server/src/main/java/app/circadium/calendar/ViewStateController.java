package app.circadium.calendar;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class ViewStateController {

    private final ViewStateService viewStateService;

    /** Both canvases' blobs, {@code null} where nothing was saved yet. */
    public record ViewStateResponse(String graph, String mindmap) {
    }

    public record SaveViewStateRequest(
            @NotNull Kind kind,
            @Schema(description = "The canvas's serialized view state, or null to clear it.")
            String state) {

        public enum Kind { graph, mindmap }
    }

    @GetMapping("/view-state")
    @Operation(summary = "The caller's canvas view preferences",
            description = "The serialized graph and mindmap view blobs. Opaque to the API; the client "
                    + "defines and defensively parses them.")
    @ApiResponse(responseCode = "200", description = "Both blobs, null where never saved")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public ViewStateResponse get(@AuthenticationPrincipal Jwt jwt) {
        return viewStateService.get(jwt.getSubject());
    }

    @PutMapping("/view-state")
    @Operation(summary = "Save one canvas's view preferences",
            description = "Patches only the named canvas's column, so graph and mindmap saves never "
                    + "clobber each other.")
    @ApiResponse(responseCode = "204", description = "Saved")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public ResponseEntity<Void> save(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody SaveViewStateRequest request) {
        viewStateService.save(jwt.getSubject(), request.kind(), request.state());
        return ResponseEntity.noContent().build();
    }
}
