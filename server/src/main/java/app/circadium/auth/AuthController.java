package app.circadium.auth;

import app.circadium.persistence.entity.Account;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.AccountRepository;
import app.circadium.persistence.repository.UserRepository;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Token lifecycle endpoints. The mobile app sends its refresh token in the JSON body and gets new tokens back in
 * the body. The web app sends no body: its refresh token arrives in the refresh cookie, and new tokens go back as
 * cookies (see {@link AuthCookies}).
 */
@RestController
@RequiredArgsConstructor
public class AuthController {

    private final TokenService tokenService;
    private final SigningKeys signingKeys;
    private final AuthCookies authCookies;
    private final UserRepository userRepository;
    private final AccountRepository accountRepository;

    @PostMapping("/auth/refresh")
    public ResponseEntity<TokenResponse> refresh(
            @Valid @RequestBody(required = false) RefreshTokenRequest request, HttpServletRequest httpRequest) {
        ClientInfo client = ClientInfo.from(httpRequest);
        if (request != null) {
            IssuedTokens tokens = tokenService.refresh(request.refreshToken(), client);
            return authCookies.deliver(tokens, ClientType.MOBILE).asResponse();
        }
        try {
            String refreshToken = authCookies.refreshToken(httpRequest).orElseThrow(InvalidRefreshTokenException::new);
            IssuedTokens tokens = tokenService.refresh(refreshToken, client);
            return authCookies.deliver(tokens, ClientType.WEB).asResponse();
        } catch (InvalidRefreshTokenException e) {
            // Otherwise the browser keeps presenting the dead token on every later attempt.
            e.getHeaders().addAll(authCookies.clear());
            throw e;
        }
    }

    /** Ends the session the refresh token belongs to. Always 204, so it is safe to repeat. */
    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(
            @Valid @RequestBody(required = false) RefreshTokenRequest request, HttpServletRequest httpRequest) {
        ClientInfo client = ClientInfo.from(httpRequest);
        if (request != null) {
            tokenService.logout(request.refreshToken(), client);
            return ResponseEntity.noContent().build();
        }
        authCookies.refreshToken(httpRequest).ifPresent(refreshToken -> tokenService.logout(refreshToken, client));
        return ResponseEntity.noContent().headers(authCookies.clear()).build();
    }

    @GetMapping("/auth/me")
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return new MeResponse(
                jwt.getSubject(),
                jwt.getClaimAsString(TokenService.ROLE_CLAIM),
                jwt.getClaimAsString(TokenService.SESSION_FAMILY_CLAIM));
    }

    /**
     * The DB-checked session the web's server components render from: the user row is authoritative for the role
     * and profile fields, and a deleted account answers 401 even while the token is within its lifetime. Session
     * liveness itself is already enforced by the decoder ({@link SessionFamilyValidator}); the issued-before
     * password-change comparison is kept as the web's own {@code getSession} performed it (second granularity,
     * same-second accepted) so the flip off Prisma provably changes nothing.
     */
    @GetMapping("/auth/session")
    public SessionResponse session(@AuthenticationPrincipal Jwt jwt) {
        User user = userRepository.findById(jwt.getSubject())
                .orElseThrow(AuthController::sessionEnded);
        Instant changed = user.getPasswordChangedAt();
        if (changed != null && jwt.getIssuedAt().getEpochSecond() < changed.getEpochSecond()) {
            throw sessionEnded();
        }
        List<String> providers = accountRepository.findAllByUserId(user.getId()).stream()
                .map(Account::getProvider)
                .toList();
        return new SessionResponse(
                new SessionResponse.SessionUser(
                        user.getId(), user.getName(), user.getEmail(), user.getRole().name(),
                        user.isTwoFactorEnabled(), !providers.isEmpty(), providers,
                        user.getOnboardedAt(), user.getAiMode() == null ? null : user.getAiMode().name(),
                        user.getAiModel()),
                jwt.getExpiresAt(),
                TokenService.isTwoFactorVerified(jwt));
    }

    private static AccountFlowException sessionEnded() {
        return new AccountFlowException(HttpStatus.UNAUTHORIZED, "session_ended", "This sign-in has ended.");
    }

    @GetMapping("/.well-known/jwks.json")
    public ResponseEntity<Map<String, Object>> jwks() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .contentType(MediaType.APPLICATION_JSON)
                .body(signingKeys.publicJwkSet());
    }

    public record RefreshTokenRequest(@NotBlank @Size(max = 512) String refreshToken) {}

    /**
     * The mobile app gets both tokens here. The web app gets only the expiry times, since its tokens are in HttpOnly
     * cookies; it uses them to refresh before the access token runs out.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TokenResponse(
            String tokenType,
            String accessToken,
            Instant accessTokenExpiresAt,
            String refreshToken,
            Instant refreshTokenExpiresAt) {

        public static TokenResponse from(IssuedTokens tokens) {
            return new TokenResponse("Bearer", tokens.accessToken(), tokens.accessTokenExpiresAt(),
                    tokens.refreshToken(), tokens.refreshTokenExpiresAt());
        }

        public static TokenResponse expiryOnly(IssuedTokens tokens) {
            return new TokenResponse(null, null, tokens.accessTokenExpiresAt(), null, tokens.refreshTokenExpiresAt());
        }
    }

    public record MeResponse(String userId, String role, String sessionId) {}

    /** Mirrors the web's {@code lib/session/session.ts} Session shape, plus the protected layout's profile reads. */
    public record SessionResponse(SessionUser user, Instant accessTokenExpiresAt, boolean twoFactorVerified) {

        public record SessionUser(
                String id,
                String name,
                String email,
                String role,
                boolean isTwoFactorEnabled,
                boolean isOAuth,
                List<String> signInProviders,
                Instant onboardedAt,
                String aiMode,
                String aiModel) {}
    }
}
