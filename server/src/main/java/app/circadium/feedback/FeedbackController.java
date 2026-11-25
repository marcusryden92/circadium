package app.circadium.feedback;

import app.circadium.feedback.FeedbackService.SuggestionView;
import app.circadium.feedback.FeedbackService.SupportMessageResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Feedback")
public class FeedbackController {

    private final FeedbackService feedbackService;

    public record SupportMessageRequest(String message, @NotNull Boolean includeSnapshot) {}

    public record SuggestionRequest(String title, String body) {}

    public record VoteRequest(@NotNull Integer value) {}

    @PostMapping("/feedback/support")
    @Operation(summary = "Send a support message",
            description = "Stores the report (with a full data-export snapshot when consented) and "
                    + "queues a notification to the support inbox; the notification's delivery never "
                    + "fails the report.")
    @ApiResponse(responseCode = "200", description = "The stored report's id")
    @ApiResponse(responseCode = "400", description = "Message too short or too long (code invalid_message)")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "500", description = "The consented snapshot could not be captured "
            + "(code snapshot_failed)")
    public SupportMessageResult sendSupportMessage(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody SupportMessageRequest request) {
        return feedbackService.sendSupportMessage(jwt.getSubject(), request.message(),
                request.includeSnapshot());
    }

    @GetMapping("/suggestions")
    @Operation(summary = "List the suggestion wall",
            description = "Every user's suggestions, newest first, capped at 300, with vote totals and "
                    + "the caller's own vote.")
    @ApiResponse(responseCode = "200", description = "The wall")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public List<SuggestionView> getSuggestions(@AuthenticationPrincipal Jwt jwt) {
        return feedbackService.getSuggestions(jwt.getSubject());
    }

    @PostMapping("/suggestions")
    @Operation(summary = "Post a suggestion",
            description = "Creates the suggestion with the author's own upvote; capped at 25 per user.")
    @ApiResponse(responseCode = "200", description = "The created suggestion as the wall renders it")
    @ApiResponse(responseCode = "400", description = "Bad title or body (code invalid_suggestion)")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "409", description = "The per-user cap is reached (code suggestion_limit)")
    public SuggestionView createSuggestion(@AuthenticationPrincipal Jwt jwt,
            @RequestBody SuggestionRequest request) {
        return feedbackService.createSuggestion(jwt.getSubject(), request.title(), request.body());
    }

    @PutMapping("/suggestions/{suggestionId}/vote")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Vote on a suggestion",
            description = "1 or -1 upserts the caller's vote; 0 removes it (idempotent).")
    @ApiResponse(responseCode = "204", description = "Recorded")
    @ApiResponse(responseCode = "400", description = "Not 1, -1 or 0 (code invalid_vote)")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "No such suggestion (code suggestion_not_found)")
    public void vote(@AuthenticationPrincipal Jwt jwt, @PathVariable String suggestionId,
            @Valid @RequestBody VoteRequest request) {
        feedbackService.vote(jwt.getSubject(), suggestionId, request.value());
    }

    @DeleteMapping("/suggestions/{suggestionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a suggestion",
            description = "The caller's own; an ADMIN session that passed the emailed 2FA code may "
                    + "delete anyone's. A missing id is a no-op.")
    @ApiResponse(responseCode = "204", description = "Deleted, or nothing to delete")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public void deleteSuggestion(Authentication authentication, @PathVariable String suggestionId) {
        JwtAuthenticationToken token = (JwtAuthenticationToken) authentication;
        feedbackService.deleteSuggestion(token.getToken().getSubject(), suggestionId, isAdminWithMfa(token));
    }

    /** The web's admin rule: the ADMIN role alone is not enough, the sign-in must have passed 2FA. */
    private static boolean isAdminWithMfa(JwtAuthenticationToken token) {
        boolean admin = token.getAuthorities().contains(new SimpleGrantedAuthority("ROLE_ADMIN"));
        List<String> amr = token.getToken().getClaimAsStringList("amr");
        return admin && amr != null && amr.contains("mfa");
    }
}
