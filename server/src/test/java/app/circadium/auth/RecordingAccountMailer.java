package app.circadium.auth;

import app.circadium.external.mail.AccountMailer;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

/** Captures outgoing account mail so tests can read the token or code a user would have received. */
public class RecordingAccountMailer implements AccountMailer {

    public enum Kind {
        VERIFICATION, TWO_FACTOR, PASSWORD_RESET, PASSWORD_CHANGED, ACCOUNT_DELETION, EXISTING_ACCOUNT,
        EMAIL_CHANGE_VERIFICATION, EMAIL_CHANGE_REQUESTED, EMAIL_CHANGED, TWO_FACTOR_CHANGED, OAUTH_SIGNUP
    }

    /** @param value the token or code, or for notices the detail they carry (the new email, the new setting) */
    public record Sent(Kind kind, String email, String value) {}

    private final List<Sent> sent = new CopyOnWriteArrayList<>();

    @Override
    public void sendVerificationEmail(String email, String token) {
        sent.add(new Sent(Kind.VERIFICATION, email, token));
    }

    /** Records the token; the provider name is fixed per provider and not under test here. */
    @Override
    public void sendOAuthSignupConfirmation(String email, String token, String provider) {
        sent.add(new Sent(Kind.OAUTH_SIGNUP, email, token));
    }

    @Override
    public void sendTwoFactorCode(String email, String code) {
        sent.add(new Sent(Kind.TWO_FACTOR, email, code));
    }

    @Override
    public void sendPasswordResetEmail(String email, String token) {
        sent.add(new Sent(Kind.PASSWORD_RESET, email, token));
    }

    @Override
    public void sendPasswordChangedNotice(String email) {
        sent.add(new Sent(Kind.PASSWORD_CHANGED, email, null));
    }

    @Override
    public void sendEmailChangeVerification(String newEmail, String token) {
        sent.add(new Sent(Kind.EMAIL_CHANGE_VERIFICATION, newEmail, token));
    }

    @Override
    public void sendEmailChangeRequestedNotice(String currentEmail, String newEmail) {
        sent.add(new Sent(Kind.EMAIL_CHANGE_REQUESTED, currentEmail, newEmail));
    }

    @Override
    public void sendEmailChangedNotice(String previousEmail, String newEmail) {
        sent.add(new Sent(Kind.EMAIL_CHANGED, previousEmail, newEmail));
    }

    @Override
    public void sendTwoFactorChangedNotice(String email, boolean enabled) {
        sent.add(new Sent(Kind.TWO_FACTOR_CHANGED, email, String.valueOf(enabled)));
    }

    @Override
    public void sendAccountDeletionEmail(String email, String token) {
        sent.add(new Sent(Kind.ACCOUNT_DELETION, email, token));
    }

    @Override
    public void sendExistingAccountNotice(String email, boolean hasPassword) {
        sent.add(new Sent(Kind.EXISTING_ACCOUNT, email, String.valueOf(hasPassword)));
    }

    public Optional<String> latest(Kind kind, String email) {
        return sent.reversed().stream()
                .filter(message -> message.kind() == kind && message.email().equals(email))
                .map(Sent::value)
                .findFirst();
    }

    public long count(Kind kind, String email) {
        return sent.stream().filter(message -> message.kind() == kind && message.email().equals(email)).count();
    }
}
