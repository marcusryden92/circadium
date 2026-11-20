package app.circadium.auth.oauth;

import app.circadium.auth.AccountFlowException;
import app.circadium.auth.AuditEvent;
import app.circadium.auth.AuditLogger;
import app.circadium.auth.AuthController.TokenResponse;
import app.circadium.auth.AuthCookies;
import app.circadium.auth.ClientInfo;
import app.circadium.auth.CredentialsAuthService;
import app.circadium.auth.IssuedTokens;
import app.circadium.auth.TokenService;
import app.circadium.auth.oauth.OAuthHandoffCodes.Redemption;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class OAuthHandoffController {

    private final OAuthHandoffCodes handoffCodes;
    private final UserRepository userRepository;
    private final TokenService tokenService;
    private final AuditLogger auditLogger;
    private final AuthCookies authCookies;

    /**
     * Trades the one-time code from a finished Google sign-in, plus the verifier only the client that started the
     * sign-in holds, for the same tokens {@code /auth/login} returns. The code remembers which app started the
     * sign-in, so a web sign-in always ends in cookies.
     */
    @PostMapping("/auth/handoff")
    public ResponseEntity<TokenResponse> handoff(@Valid @RequestBody HandoffRequest request,
            HttpServletRequest httpRequest) {
        ClientInfo client = ClientInfo.from(httpRequest);
        Redemption redemption = handoffCodes.redeem(request.code(), request.verifier());
        if (redemption instanceof Redemption.Rejected rejected) {
            auditLogger.record(AuditEvent.OAUTH_HANDOFF_FAILURE, null, null, client, rejected.reason());
            throw invalidCode();
        }
        Redemption.Redeemed redeemed = (Redemption.Redeemed) redemption;
        User user = userRepository.findById(redeemed.userId()).orElseThrow(OAuthHandoffController::invalidCode);

        IssuedTokens tokens = tokenService.startSession(user, client.userAgent());
        String email = user.getEmail() == null ? null : CredentialsAuthService.normalize(user.getEmail());
        auditLogger.record(AuditEvent.LOGIN_SUCCESS, user.getId(), email, client,
                "oauth " + redeemed.client().parameter());
        return authCookies.deliver(tokens, redeemed.client()).asResponse();
    }

    private static AccountFlowException invalidCode() {
        return new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_code",
                "This sign-in has expired or was already used. Sign in again.");
    }

    /**
     * @param code the handoff code, 32 random bytes in base64url
     * @param verifier the client's PKCE-style verifier (RFC 7636: 43 to 128 unreserved characters)
     */
    public record HandoffRequest(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String code,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9._~-]{43,128}") String verifier) {}
}
