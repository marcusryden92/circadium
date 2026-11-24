package app.circadium.calendar;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class OccurrenceCompletionController {

    private final OccurrenceCompletionService completionService;

    /** The window of the completed occurrence; start/end are the client's ISO strings, stored as written. */
    public record LogOccurrenceCompletionRequest(
            @NotNull String plannerId,
            @NotNull String occurrenceKey,
            @NotNull String start,
            @NotNull String end) {
    }

    @GetMapping("/calendar/occurrence-completions")
    @Operation(summary = "The caller's occurrence-completion log",
            description = "One row per completed occurrence of a recurring item, or per checked-off plan "
                    + "occurrence. Kept outside the sync diff: reading or writing it never moves dataVersion.")
    @ApiResponse(responseCode = "200", description = "The caller's rows")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public List<CalendarContracts.OccurrenceCompletion> list(@AuthenticationPrincipal Jwt jwt) {
        return completionService.list(jwt.getSubject());
    }

    @PutMapping("/calendar/occurrence-completions")
    @Operation(summary = "Log a completed occurrence",
            description = "Upserts on (plannerId, occurrenceKey): re-logging the same occurrence moves only "
                    + "its start/end window, keeping the row's id and createdAt.")
    @ApiResponse(responseCode = "200", description = "The stored row")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "The planner item is missing or someone else's "
            + "(code item_not_found)")
    public CalendarContracts.OccurrenceCompletion log(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody LogOccurrenceCompletionRequest request) {
        return completionService.log(jwt.getSubject(), request.plannerId(), request.occurrenceKey(),
                request.start(), request.end());
    }

    @DeleteMapping("/calendar/occurrence-completions")
    @Operation(summary = "Remove a logged occurrence completion",
            description = "A row that does not exist is a no-op, so an un-log can never fail a double click.")
    @ApiResponse(responseCode = "204", description = "The row is gone")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public ResponseEntity<Void> unlog(@AuthenticationPrincipal Jwt jwt, @RequestParam String plannerId,
            @RequestParam String occurrenceKey) {
        completionService.unlog(jwt.getSubject(), plannerId, occurrenceKey);
        return ResponseEntity.noContent().build();
    }
}
