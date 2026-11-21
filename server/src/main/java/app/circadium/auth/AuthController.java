package app.circadium.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
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
}
