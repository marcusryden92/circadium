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

    void sendAccountDeletionEmail(String email, String token);

    /**
     * Sent when someone registers with an address that already has an account, instead of revealing that
     * in the registration response.
     *
     * @param hasPassword false for accounts that only sign in through an OAuth provider
     */
    void sendExistingAccountNotice(String email, boolean hasPassword);
}
