package app.circadium.calendar;

import app.circadium.calendar.DraftConversationService.Payload;
import app.circadium.calendar.DraftConversationService.Summary;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class DraftConversationController {

    private final DraftConversationService draftConversationService;

    /** Messages ride as raw JSON: the sanitizer is the schema, so a shape change needs no migration. */
    public record UpsertDraftConversationRequest(String title, JsonNode messages) {
    }

    @GetMapping("/draft-conversations")
    @Operation(summary = "List the assistant chat history",
            description = "The newest 50 conversations, newest first; summaries only.")
    @ApiResponse(responseCode = "200", description = "Conversation summaries")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public List<Summary> list(@AuthenticationPrincipal Jwt jwt) {
        return draftConversationService.list(jwt.getSubject());
    }

    @GetMapping("/draft-conversations/{conversationId}")
    @Operation(summary = "Load one conversation",
            description = "The whole ordered message array, sanitized on the way out.")
    @ApiResponse(responseCode = "200", description = "The conversation")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "Not the caller's conversation "
            + "(code conversation_not_found)")
    public Payload get(@AuthenticationPrincipal Jwt jwt, @PathVariable String conversationId) {
        return draftConversationService.get(jwt.getSubject(), conversationId);
    }

    @PutMapping("/draft-conversations/{conversationId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Save a conversation wholesale",
            description = "Client-minted id; creates or replaces title and messages, then trims "
                    + "the account to the newest 50 conversations.")
    @ApiResponse(responseCode = "204", description = "Saved")
    @ApiResponse(responseCode = "400", description = "Unusable id (code invalid_conversation_id) or "
            + "no valid messages after sanitizing (code nothing_to_save)")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "The id belongs to another user "
            + "(code conversation_not_found)")
    public void upsert(@AuthenticationPrincipal Jwt jwt, @PathVariable String conversationId,
            @RequestBody UpsertDraftConversationRequest request) {
        draftConversationService.upsert(jwt.getSubject(), conversationId, request.title(),
                request.messages());
    }

    @DeleteMapping("/draft-conversations/{conversationId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a conversation", description = "A missing id is a no-op.")
    @ApiResponse(responseCode = "204", description = "Deleted, or nothing to delete")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String conversationId) {
        draftConversationService.delete(jwt.getSubject(), conversationId);
    }
}
