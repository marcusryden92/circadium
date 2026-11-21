package app.circadium.external.passwords;

/** Whether a password appears in known data breaches, which attackers try before anything else. */
@FunctionalInterface
public interface BreachedPasswords {

    /** False when the answer is unknown (the lookup failed): a new password is never refused for that alone. */
    boolean isBreached(String password);
}
