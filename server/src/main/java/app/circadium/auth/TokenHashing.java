package app.circadium.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * SHA-256 for tokens stored at rest (refresh tokens, the emailed account-flow tokens), so a database read
 * yields nothing presentable. A plain unsalted hash is sufficient: every hashed token is an unguessable
 * random value, not a password.
 */
public final class TokenHashing {

    private TokenHashing() {}

    public static String sha256Hex(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
