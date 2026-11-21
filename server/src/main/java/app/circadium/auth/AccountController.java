package app.circadium.auth;

import app.circadium.auth.AuthController.TokenResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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
 * Account flows. The emailed-link endpoints under {@code /auth/*} are public (the link is the credential); the
 * {@code /account/*} endpoints require the caller's access token.
 */
@RestController
@RequiredArgsConstructor
public class AccountController {

    private final EmailVerificationService emailVerificationService;
    private final PasswordResetService passwordResetService;
    private final PasswordChangeService passwordChangeService;
    private final AccountSettingsService accountSettingsService;
    private final AccountDeletionService accountDeletionService;
    private final AuthCookies authCookies;

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

    /** Signs out every session and answers with a new one for the caller, delivered like a login's. */
    @PostMapping("/account/password")
    public ResponseEntity<TokenResponse> changePassword(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody PasswordChangeRequest request, HttpServletRequest httpRequest) {
        IssuedTokens tokens = passwordChangeService.changePassword(jwt.getSubject(), request.currentPassword(),
                request.newPassword(), ClientInfo.from(httpRequest), TokenService.isTwoFactorVerified(jwt));
        return authCookies.deliver(tokens, request.client()).asResponse();
    }

    /** Emails a confirmation link to the new address; the account moves only once that link is opened. */
    @PostMapping("/account/email")
    public ResponseEntity<StatusResponse> requestEmailChange(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody EmailChangeRequest request, HttpServletRequest httpRequest) {
        accountSettingsService.requestEmailChange(jwt.getSubject(), request.currentPassword(), request.newEmail(),
                ClientInfo.from(httpRequest));
        return respond(HttpStatus.ACCEPTED, "VERIFICATION_EMAIL_SENT");
    }

    @PostMapping("/account/two-factor")
    public ResponseEntity<StatusResponse> setTwoFactor(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody TwoFactorSettingRequest request, HttpServletRequest httpRequest) {
        accountSettingsService.setTwoFactor(jwt.getSubject(), request.currentPassword(), request.enabled(),
                ClientInfo.from(httpRequest));
        return respond(HttpStatus.OK, request.enabled() ? "TWO_FACTOR_ENABLED" : "TWO_FACTOR_DISABLED");
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

    /** Same rules as registration ({@link PasswordPolicy}). */
    public record NewPasswordRequest(
            @NotBlank @Size(max = 128) String token,
            @NotBlank @Size(min = PasswordPolicy.MIN_LENGTH, max = PasswordPolicy.MAX_BYTES) String password) {}

    /**
     * The current password has no minimum, like login's: older accounts may have shorter ones. The new one
     * follows registration's rules. {@code client} as in login: the web app sends {@code web} and gets cookies.
     */
    public record PasswordChangeRequest(
            @NotBlank @Size(max = 256) String currentPassword,
            @NotBlank @Size(min = PasswordPolicy.MIN_LENGTH, max = PasswordPolicy.MAX_BYTES) String newPassword,
            ClientType client) {

        public PasswordChangeRequest {
            client = client == null ? ClientType.MOBILE : client;
        }
    }

    public record EmailChangeRequest(
            @NotBlank @Size(max = 256) String currentPassword,
            @NotBlank @Email @Size(max = 254) String newEmail) {}

    public record TwoFactorSettingRequest(@NotBlank @Size(max = 256) String currentPassword, @NotNull Boolean enabled) {}

    /** {@code password} is required for accounts that have one; OAuth-only accounts confirm by email alone. */
    public record DeletionRequest(
            @NotBlank @Size(max = 254) String confirmEmail,
            @Size(max = 256) String password) {}

    public record StatusResponse(String status) {}
}
