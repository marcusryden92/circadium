package app.circadium.auth;

import app.circadium.persistence.repository.SessionRepository;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Refuses an access token whose sign-in has ended. Sign-out, reuse detection, and a password change or reset all
 * delete the family's refresh rows, so without this a copied access token would keep working for the rest of its
 * 15 minutes. One indexed lookup per authenticated request.
 */
final class SessionFamilyValidator implements OAuth2TokenValidator<Jwt> {

    private static final OAuth2Error SESSION_ENDED =
            new OAuth2Error(OAuth2ErrorCodes.INVALID_TOKEN, "The session this token belongs to has ended", null);

    private final SessionRepository sessionRepository;

    SessionFamilyValidator(SessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        String familyId = token.getClaimAsString(TokenService.SESSION_FAMILY_CLAIM);
        if (familyId != null && sessionRepository.existsByFamilyId(familyId)) {
            return OAuth2TokenValidatorResult.success();
        }
        return OAuth2TokenValidatorResult.failure(SESSION_ENDED);
    }
}
