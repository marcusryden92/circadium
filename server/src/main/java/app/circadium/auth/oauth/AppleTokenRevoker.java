package app.circadium.auth.oauth;

/**
 * Ends the app's Sign in with Apple authorization for a user, as part of deleting their account. App Store review
 * requires it, and without it Apple keeps listing Circadium under the person's Apple ID and keeps offering
 * "Continue with Apple" as if the account still existed.
 */
@FunctionalInterface
public interface AppleTokenRevoker {

    /**
     * Starts revoking the refresh token Apple issued at sign-in. Returns at once: the account is already gone when
     * this runs, so a failure is reported to Sentry rather than to the user, who can still remove the app under
     * their Apple ID's "Sign in with Apple" settings.
     */
    void revoke(String refreshToken);
}
