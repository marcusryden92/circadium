package app.circadium.auth.oauth;

import app.circadium.auth.oauth.OAuthAccountService.ProviderIdentity;
import com.nimbusds.jose.util.JSONObjectUtils;
import jakarta.servlet.http.HttpServletRequest;
import java.text.ParseException;
import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.util.StringUtils;

/**
 * The sign-in providers, and how each one's ID token becomes a {@link ProviderIdentity}. The providers name, key
 * and vouch for their users differently, so each mapping is spelled out instead of read off a shared shape.
 */
public enum SignInProvider {

    GOOGLE("google", "Google"),
    MICROSOFT("microsoft", "Microsoft"),
    APPLE("apple", "Apple");

    /** Longest name part kept from Apple's {@code user} form field, which the browser, not Apple, delivers. */
    private static final int MAX_NAME_PART_LENGTH = 100;

    private final String registrationId;
    private final String displayName;

    SignInProvider(String registrationId, String displayName) {
        this.registrationId = registrationId;
        this.displayName = displayName;
    }

    /** Also the path segment in {@code /oauth2/authorization/{id}} and {@code /login/oauth2/code/{id}}. */
    public String registrationId() {
        return registrationId;
    }

    public String displayName() {
        return displayName;
    }

    public static Optional<SignInProvider> fromRegistrationId(String registrationId) {
        return Arrays.stream(values()).filter(provider -> provider.registrationId.equals(registrationId)).findFirst();
    }

    static String registrationIds() {
        return Arrays.stream(values()).map(SignInProvider::registrationId).collect(Collectors.joining(", "));
    }

    /**
     * @param callback the callback request, which carries Apple's {@code user} field on a first authorization
     * @param refreshToken the provider's refresh token from the token response, kept only for Apple (see
     *     {@link OAuthAccountService})
     */
    ProviderIdentity identity(OidcUser user, HttpServletRequest callback, String refreshToken) {
        return switch (this) {
            case GOOGLE -> new ProviderIdentity(registrationId, user.getSubject(), user.getEmail(),
                    Boolean.TRUE.equals(user.getEmailVerified()), user.getFullName(), user.getPicture(), null);
            case MICROSOFT -> microsoftIdentity(user);
            case APPLE -> new ProviderIdentity(registrationId, user.getSubject(), user.getEmail(),
                    Boolean.TRUE.equals(user.getEmailVerified()), appleName(callback.getParameter("user")), null,
                    refreshToken);
        };
    }

    /**
     * Keyed on {@code oid}, the user's object id, rather than {@code sub}: Microsoft's {@code sub} is pairwise per
     * app registration, so replacing the registration (shared with calendar import, and already orphaned once
     * when the Azure subscription lapsed) would change every user's {@code sub} and strand their accounts.
     *
     * <p>Microsoft says its {@code email} claim "isn't guaranteed to be correct", so the address is never trusted:
     * a new account waits for the emailed link. That also makes {@code preferred_username} safe as a fallback for
     * work accounts without a mail attribute; a username that is not a mailbox simply never gets the link.
     */
    private ProviderIdentity microsoftIdentity(OidcUser user) {
        String objectId = user.getClaimAsString("oid");
        if (!StringUtils.hasText(objectId)) {
            throw new IllegalStateException("Microsoft ID token has no oid claim");
        }
        String email = StringUtils.hasText(user.getEmail()) ? user.getEmail() : user.getPreferredUsername();
        if (email != null && !email.contains("@")) {
            email = null;
        }
        return new ProviderIdentity(registrationId, objectId, email, false, user.getFullName(), null, null);
    }

    /**
     * Apple sends the name only on the first authorization, as JSON in the callback form
     * ({@code {"name":{"firstName":"...","lastName":"..."}}}), never in the ID token. Anything unreadable just means
     * no name.
     */
    static String appleName(String userField) {
        if (!StringUtils.hasText(userField)) {
            return null;
        }
        try {
            Map<String, Object> user = JSONObjectUtils.parse(userField);
            if (!(user.get("name") instanceof Map<?, ?> name)) {
                return null;
            }
            String joined = Stream.of(name.get("firstName"), name.get("lastName"))
                    .map(SignInProvider::namePart)
                    .filter(StringUtils::hasText)
                    .collect(Collectors.joining(" "));
            return joined.isEmpty() ? null : joined;
        } catch (ParseException e) {
            return null;
        }
    }

    private static String namePart(Object value) {
        if (!(value instanceof String text)) {
            return null;
        }
        String cleaned = text.replaceAll("\\p{Cntrl}", "").strip();
        return cleaned.length() > MAX_NAME_PART_LENGTH ? cleaned.substring(0, MAX_NAME_PART_LENGTH) : cleaned;
    }
}
