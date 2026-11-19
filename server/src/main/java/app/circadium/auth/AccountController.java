package app.circadium.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * The emailed-link flows. The {@code /auth/*} endpoints are public (the link is the credential); the
 * {@code /account/*} endpoints require the caller's access token.
 */
@RestController
@RequiredArgsConstructor
public class AccountController {

    private final EmailVerificationService emailVerificationService;
    private final PasswordResetService passwordResetService;
    private final AccountDeletionService accountDeletionService;

    @PostMapping("/auth/verify-email")
    public ResponseEntity<StatusResponse> verifyEmail(@Valid @RequestBody TokenRequest request,
            HttpServletRequest httpRequest) {
        emailVerificationService.verify(request.token(), ClientInfo.from(httpRequest));
        return respond(HttpStatus.OK, "EMAIL_VERIFIED");
    }

    @PostMapping("/auth/password-reset")
    public ResponseEntity<StatusResponse> requestPasswordReset(@Valid @RequestBody PasswordResetRequest request,
            HttpServletRequest httpRequest) {
        passwordResetService.requestReset(request.email(), ClientInfo.from(httpRequest));
        return respond(HttpStatus.ACCEPTED, "RESET_EMAIL_SENT");
    }

    @PostMapping("/auth/password-reset/confirm")
    public ResponseEntity<StatusResponse> resetPassword(@Valid @RequestBody NewPasswordRequest request,
            HttpServletRequest httpRequest) {
        passwordResetService.resetPassword(request.token(), request.password(), ClientInfo.from(httpRequest));
        return respond(HttpStatus.OK, "PASSWORD_UPDATED");
    }

    @PostMapping("/account/deletion")
    public ResponseEntity<StatusResponse> requestDeletion(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody DeletionRequest request, HttpServletRequest httpRequest) {
        accountDeletionService.requestDeletion(jwt.getSubject(), request.confirmEmail(), request.password(),
                ClientInfo.from(httpRequest));
        return respond(HttpStatus.ACCEPTED, "CONFIRMATION_EMAIL_SENT");
    }

    @PostMapping("/account/deletion/confirm")
    public ResponseEntity<StatusResponse> confirmDeletion(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody TokenRequest request, HttpServletRequest httpRequest) {
        accountDeletionService.confirmDeletion(jwt.getSubject(), request.token(), ClientInfo.from(httpRequest));
        return respond(HttpStatus.OK, "ACCOUNT_DELETED");
    }

    private static ResponseEntity<StatusResponse> respond(HttpStatus status, String body) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new StatusResponse(body));
    }

    public record TokenRequest(@NotBlank @Size(max = 128) String token) {}

    public record PasswordResetRequest(@NotBlank @Email @Size(max = 254) String email) {}

    /** Same rule as registration: 8+ characters, with the 72-byte bcrypt ceiling enforced in the service. */
    public record NewPasswordRequest(
            @NotBlank @Size(max = 128) String token,
            @NotBlank @Size(min = 8, max = 72) String password) {}

    /** {@code password} is required for accounts that have one; OAuth-only accounts confirm by email alone. */
    public record DeletionRequest(
            @NotBlank @Size(max = 254) String confirmEmail,
            @Size(max = 256) String password) {}

    public record StatusResponse(String status) {}
}
