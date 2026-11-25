package app.circadium.account;

import app.circadium.auth.AccountFlowException;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.enums.AiMode;
import app.circadium.persistence.repository.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The small profile settings, ported from {@code actions/settings.ts} + {@code actions/onboarding.ts}.
 * Everything that decides who can sign in (email, password, two-factor, deletion) lives in
 * {@code auth/AccountController} and re-checks the current password; these do not.
 */
@RestController
@RequiredArgsConstructor
@Tag(name = "Account data")
public class ProfileController {

    /**
     * The assistant model lineup, mirroring {@code client/shared/src/draft/assistantEngine/aiModels.ts}
     * — the two must change together. Stored as a plain string so the lineup can change without a
     * migration; the client engine falls back to its default for anything it no longer knows.
     */
    static final List<String> AI_MODELS = List.of("claude-opus-4-8", "claude-sonnet-5");

    private final UserRepository userRepository;
    private final Clock clock;

    public record ProfileRequest(@Size(max = 100) String name) {}

    public record AiModeRequest(String mode) {}

    public record AiModelRequest(String model) {}

    @PatchMapping("/account/profile")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Update the display name",
            description = "Explicit whitelist: the name is the only profile column the client may set "
                    + "directly. Absent means leave as is; the empty string clears it to empty.")
    @ApiResponse(responseCode = "204", description = "Updated")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public void updateProfile(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProfileRequest request) {
        if (request.name() != null) {
            userRepository.updateName(jwt.getSubject(), request.name().trim());
        }
    }

    @PutMapping("/account/ai-mode")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Set the AI assistant mode",
            description = "BYOK or OFF. The API key itself never reaches this server — it stays "
                    + "encrypted on the user's device. MANAGED is reserved for a future app-key paid "
                    + "mode and is not settable until that ships.")
    @ApiResponse(responseCode = "204", description = "Updated")
    @ApiResponse(responseCode = "400", description = "Not BYOK or OFF (code invalid_mode)")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public void updateAiMode(@AuthenticationPrincipal Jwt jwt, @RequestBody AiModeRequest request) {
        if (!"BYOK".equals(request.mode()) && !"OFF".equals(request.mode())) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_mode", "Invalid mode.");
        }
        userRepository.updateAiMode(jwt.getSubject(), AiMode.valueOf(request.mode()));
    }

    @PutMapping("/account/ai-model")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Set the AI assistant model",
            description = "Validated against the current lineup so a stale or forged id never reaches "
                    + "the Anthropic API; the client engine falls back to its default regardless.")
    @ApiResponse(responseCode = "204", description = "Updated")
    @ApiResponse(responseCode = "400", description = "Not in the lineup (code invalid_model)")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public void updateAiModel(@AuthenticationPrincipal Jwt jwt, @RequestBody AiModelRequest request) {
        if (request.model() == null || !AI_MODELS.contains(request.model())) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_model", "Invalid model.");
        }
        userRepository.updateAiModel(jwt.getSubject(), request.model());
    }

    @PostMapping("/account/onboarding-complete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Mark first-run onboarding finished",
            description = "Stamps onboardedAt; finishing and skipping both land here. Idempotent — a "
                    + "second call just moves the stamp.")
    @ApiResponse(responseCode = "204", description = "Stamped")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public void completeOnboarding(@AuthenticationPrincipal Jwt jwt) {
        userRepository.updateOnboardedAt(jwt.getSubject(), DbTime.now(clock));
    }
}
