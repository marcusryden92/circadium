package app.circadium.auth.oauth;

import java.util.regex.Pattern;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The issuer check for Microsoft's multi-tenant ({@code common}) endpoint. Its metadata issuer is the template
 * {@code https://login.microsoftonline.com/{tenantid}/v2.0}, and every ID token names the tenant the user signed in
 * to, so no fixed value can match (the registration therefore has no issuer URI, which makes Spring's own check
 * stand aside). Microsoft's rule for multi-tenant apps: {@code tid} must be a GUID, and {@code iss} must equal the
 * template with {@code {tenantid}} replaced by exactly that {@code tid}.
 *
 * <p>Not checked: the issuer each signing key is restricted to. The ID token comes straight from Microsoft's token
 * endpoint over TLS in exchange for our own authorization code and client secret, not from a third party, so its
 * origin is already established; the key restriction guards tokens that arrive from elsewhere.
 */
final class MicrosoftIssuerValidator implements OAuth2TokenValidator<Jwt> {

    static final String TENANT_PLACEHOLDER = "{tenantid}";

    private static final Pattern GUID =
            Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    private final String issuerTemplate;

    MicrosoftIssuerValidator(String issuerTemplate) {
        if (!issuerTemplate.contains(TENANT_PLACEHOLDER)) {
            throw new IllegalArgumentException("The issuer template must contain " + TENANT_PLACEHOLDER);
        }
        this.issuerTemplate = issuerTemplate;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        String tenantId = token.getClaimAsString("tid");
        if (tenantId == null || !GUID.matcher(tenantId).matches()) {
            return failure("The ID token's tid claim is not a tenant id");
        }
        String expected = issuerTemplate.replace(TENANT_PLACEHOLDER, tenantId);
        String issuer = token.getClaimAsString("iss");
        if (!expected.equals(issuer)) {
            return failure("The ID token's issuer does not match its tenant");
        }
        return OAuth2TokenValidatorResult.success();
    }

    private static OAuth2TokenValidatorResult failure(String description) {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_id_token", description, null));
    }
}
