package app.circadium.auth;

import app.circadium.auth.AuthController.TokenResponse;
import app.circadium.auth.CredentialsAuthService.LoginOutcome;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class CredentialsController {

    private final CredentialsAuthService credentialsAuthService;

    @PostMapping("/auth/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest) {
        credentialsAuthService.register(request.name(), request.email(), request.password(),
                ClientInfo.from(httpRequest));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new RegisterResponse("VERIFICATION_EMAIL_SENT"));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {
        LoginOutcome outcome = credentialsAuthService.login(request.email(), request.password(),
                ClientInfo.from(httpRequest));
        return respond(outcome);
    }

    @PostMapping("/auth/2fa")
    public ResponseEntity<LoginResponse> verifyTwoFactor(@Valid @RequestBody TwoFactorRequest request,
            HttpServletRequest httpRequest) {
        LoginOutcome outcome = credentialsAuthService.verifyTwoFactor(request.email(), request.password(),
                request.code(), ClientInfo.from(httpRequest));
        return respond(outcome);
    }

    private static ResponseEntity<LoginResponse> respond(LoginOutcome outcome) {
        LoginResponse body = switch (outcome) {
            case LoginOutcome.Authenticated authenticated ->
                    new LoginResponse("AUTHENTICATED", TokenResponse.from(authenticated.tokens()));
            case LoginOutcome.TwoFactorRequired ignored -> new LoginResponse("TWO_FACTOR_REQUIRED", null);
            case LoginOutcome.EmailVerificationSent ignored -> new LoginResponse("EMAIL_VERIFICATION_SENT", null);
        };
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    /** New passwords: 8+ characters; the 72-byte bcrypt ceiling is enforced in the service. */
    public record RegisterRequest(
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 72) String password) {}

    /** No minimum length: accounts created by the web app may have 6-character passwords. */
    public record LoginRequest(
            @NotBlank @Size(max = 254) String email,
            @NotBlank @Size(max = 256) String password) {}

    public record TwoFactorRequest(
            @NotBlank @Size(max = 254) String email,
            @NotBlank @Size(max = 256) String password,
            @NotBlank @Pattern(regexp = "\\d{6}") String code) {}

    public record RegisterResponse(String status) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record LoginResponse(String status, TokenResponse tokens) {}
}
