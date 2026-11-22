package app.circadium.sync;

import app.circadium.calendar.CalendarContracts.BootstrapPayload;
import app.circadium.calendar.CalendarContracts.SyncRequest;
import app.circadium.calendar.CalendarContracts.SyncResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class SyncController {

    private final CalendarSyncService syncService;

    @PostMapping("/calendar/sync")
    @Operation(summary = "Save the client's changes",
            description = "Applies the create/update/destroy diff in one transaction, if the account is still at "
                    + "clientKnownDataVersion. An empty diff succeeds without changing the version.")
    @ApiResponse(responseCode = "200", description = "Saved")
    @ApiResponse(responseCode = "400", description = "The body is not a valid diff")
    @ApiResponse(responseCode = "401", description = "No valid access token, or the account no longer exists "
            + "(code account_not_found)")
    @ApiResponse(responseCode = "409", description = "Another session saved first (code stale). Nothing was saved; "
            + "freshState is the account's current state to start over from.",
            content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                    schema = @Schema(implementation = StaleSyncProblem.class)))
    public SyncResult sync(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SyncRequest request) {
        return syncService.sync(jwt.getSubject(), request);
    }

    /** Documents the 409 body: a ProblemDetail with {@code code} and {@code freshState} added. */
    @Schema(name = "StaleSyncProblem")
    record StaleSyncProblem(
            String type,
            String title,
            int status,
            String detail,
            String instance,
            String requestId,
            @Schema(allowableValues = "stale")
            String code,
            BootstrapPayload freshState) {
    }
}
