package app.circadium.auth.oauth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import org.springframework.stereotype.Component;

/**
 * Signs the client secret Apple's token and revoke endpoints require in place of a static one: an ES256 JWT made
 * with the developer account's Sign in with Apple key ({@code iss} the Team ID, {@code sub} the Services ID,
 * {@code aud} Apple). Apple refuses lifetimes over six months; signing a short-lived one per request leaves no
 * expiring secret to replace by hand.
 *
 * <p>When Apple sign-in is not configured this exists but refuses to sign. When it is, a malformed key fails at
 * startup rather than at a user's first sign-in.
 */
@Component
public class AppleClientSecret {

    static final String AUDIENCE = "https://appleid.apple.com";
    private static final Duration LIFETIME = Duration.ofMinutes(5);

    private final OAuthProperties.Apple apple;
    private final ECDSASigner signer;
    private final Clock clock;

    public AppleClientSecret(OAuthProperties properties, Clock clock) {
        this.apple = properties.apple();
        this.clock = clock;
        try {
            this.signer = apple.configured() ? new ECDSASigner(parsePrivateKey(apple.privateKey())) : null;
        } catch (JOSEException e) {
            throw new IllegalStateException("APPLE_PRIVATE_KEY is not a P-256 key", e);
        }
    }

    boolean configured() {
        return signer != null;
    }

    String clientId() {
        return apple.clientId();
    }

    String create() {
        if (signer == null) {
            throw new IllegalStateException("Apple sign-in is not configured");
        }
        Instant now = clock.instant();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(apple.teamId())
                .subject(apple.clientId())
                .audience(AUDIENCE)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(LIFETIME)))
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(apple.keyId()).build(), claims);
        try {
            jwt.sign(signer);
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not sign the Apple client secret", e);
        }
        return jwt.serialize();
    }

    /**
     * The {@code .p8} file Apple hands out is a PKCS#8 PEM. Secret stores sometimes flatten its line breaks to a
     * literal {@code \n}, which is accepted too.
     */
    static ECPrivateKey parsePrivateKey(String pem) {
        String base64 = pem.replace("\\n", "\n")
                .replaceAll("-----(BEGIN|END) [A-Z ]+-----", "")
                .replaceAll("\\s", "");
        try {
            return (ECPrivateKey) KeyFactory.getInstance("EC")
                    .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(base64)));
        } catch (GeneralSecurityException | IllegalArgumentException | ClassCastException e) {
            throw new IllegalStateException("APPLE_PRIVATE_KEY is not a PKCS#8 EC private key (the .p8 file)", e);
        }
    }
}
