package app.circadium.calendar;

import app.circadium.calendar.CalendarContracts.BootstrapPayload;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class CalendarController {

    private final CalendarBootstrapService bootstrapService;

    @GetMapping("/calendar/bootstrap")
    @Operation(summary = "The caller's whole calendar state",
            description = "Planner items, engine output, templates, categories, queues, dependencies, locations and "
                    + "travel times, with the sync counter to send back on the next sync. Read as one snapshot.")
    @ApiResponse(responseCode = "200", description = "The calendar state")
    @ApiResponse(responseCode = "401", description = "No valid access token, or the account no longer exists "
            + "(code account_not_found)")
    public ResponseEntity<BootstrapPayload> bootstrap(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(bootstrapService.load(jwt.getSubject()));
    }
}
