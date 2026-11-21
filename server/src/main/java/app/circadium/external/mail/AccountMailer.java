package app.circadium.external.mail;

/**
 * Account emails the auth flows send. Expressed as intents rather than raw messages so the implementation
 * owns templates, links, and the web base URL.
 *
 * <p>Delivery is asynchronous: each method returns once the message is queued. That keeps the provider's
 * latency and failures out of the request, so endpoints that must answer identically whether or not an
 * account exists (registration, password reset) cannot be told apart by how long they take.
 */
public interface AccountMailer {

    void sendVerificationEmail(String email, String token);

    void sendTwoFactorCode(String email, String code);

    void sendPasswordResetEmail(String email, String token);

    /** Sent after a successful reset, so the owner learns about a reset they did not make. */
    void sendPasswordChangedNotice(String email);

    /** The link that moves a signed-in account to {@code newEmail}; sent to the new address. */
    void sendEmailChangeVerification(String newEmail, String token);

    /** Sent to the current address when a change is requested, while the owner can still stop it. */
    void sendEmailChangeRequestedNotice(String currentEmail, String newEmail);

    /** Sent to the previous address once the account has moved. */
    void sendEmailChangedNotice(String previousEmail, String newEmail);

    void sendTwoFactorChangedNotice(String email, boolean enabled);

    void sendAccountDeletionEmail(String email, String token);

    /**
     * Sent when someone registers with an address that already has an account, instead of revealing that
     * in the registration response.
     *
     * @param hasPassword false for accounts that only sign in through an OAuth provider
     */
    void sendExistingAccountNotice(String email, boolean hasPassword);
}
