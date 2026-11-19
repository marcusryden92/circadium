package app.circadium.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Token lifecycle endpoints. The refresh token travels in the JSON body. */
@RestController
@RequiredArgsConstructor
public class AuthController {

    private final TokenService tokenService;
    private final SigningKeys signingKeys;

    @PostMapping("/auth/refresh")
    public ResponseEntity<TokenResponse> refresh(
            @Valid @RequestBody RefreshTokenRequest request, HttpServletRequest httpRequest) {
        IssuedTokens tokens = tokenService.refresh(request.refreshToken(), ClientInfo.from(httpRequest));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(TokenResponse.from(tokens));
    }

    @PostMapping("/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody RefreshTokenRequest request, HttpServletRequest httpRequest) {
        tokenService.logout(request.refreshToken(), ClientInfo.from(httpRequest));
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

    public record TokenResponse(
            String tokenType,
            String accessToken,
            Instant accessTokenExpiresAt,
            String refreshToken,
            Instant refreshTokenExpiresAt) {

        static TokenResponse from(IssuedTokens tokens) {
            return new TokenResponse("Bearer", tokens.accessToken(), tokens.accessTokenExpiresAt(),
                    tokens.refreshToken(), tokens.refreshTokenExpiresAt());
        }
    }

    public record MeResponse(String userId, String role, String sessionId) {}
}
