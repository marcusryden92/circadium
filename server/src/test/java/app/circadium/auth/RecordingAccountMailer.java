package app.circadium.auth;

import app.circadium.external.mail.AccountMailer;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

/** Captures outgoing account mail so tests can read the token or code a user would have received. */
public class RecordingAccountMailer implements AccountMailer {

    public enum Kind { VERIFICATION, TWO_FACTOR }

    public record Sent(Kind kind, String email, String value) {}

    private final List<Sent> sent = new CopyOnWriteArrayList<>();

    @Override
    public void sendVerificationEmail(String email, String token) {
        sent.add(new Sent(Kind.VERIFICATION, email, token));
    }

    @Override
    public void sendTwoFactorCode(String email, String code) {
        sent.add(new Sent(Kind.TWO_FACTOR, email, code));
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
