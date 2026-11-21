package app.circadium.auth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;

/**
 * The RS256 key ring. The first key is the active signer; all keys stay published in the JWKS and
 * accepted for verification so tokens signed before a rotation remain valid until they expire.
 */
@Slf4j
public final class SigningKeys {

    private static final int EPHEMERAL_KEY_BITS = 2048;

    private final List<RSAKey> keys;
    private final JWKSource<SecurityContext> jwkSource;

    private SigningKeys(List<RSAKey> keys) {
        this.keys = List.copyOf(keys);
        this.jwkSource = new ImmutableJWKSet<>(new JWKSet(new ArrayList<JWK>(this.keys)));
    }

    public static SigningKeys from(AuthProperties properties) {
        if (properties.signingKeys().isEmpty()) {
            if (!properties.allowEphemeralKey()) {
                throw new IllegalStateException(
                        "No JWT signing keys configured (circadium.auth.signing-keys) and ephemeral keys are disabled");
            }
            log.warn("No JWT signing keys configured; generating an ephemeral key. Tokens will not survive a restart.");
            return new SigningKeys(List.of(generateEphemeral()));
        }
        Set<String> seenKids = new HashSet<>();
        List<RSAKey> parsed = new ArrayList<>();
        for (AuthProperties.SigningKey configured : properties.signingKeys()) {
            if (!seenKids.add(configured.kid())) {
                throw new IllegalStateException("Duplicate JWT signing key id: " + configured.kid());
            }
            parsed.add(parse(configured.kid(), configured.privateKey()));
        }
        return new SigningKeys(parsed);
    }

    public String activeKeyId() {
        return keys.getFirst().getKeyID();
    }

    public JWKSource<SecurityContext> jwkSource() {
        return jwkSource;
    }

    public Map<String, Object> publicJwkSet() {
        return new JWKSet(new ArrayList<JWK>(keys)).toPublicJWKSet().toJSONObject();
    }

    static RSAKey parse(String kid, String pem) {
        if (pem.contains("BEGIN RSA PRIVATE KEY")) {
            throw new IllegalStateException("Signing key '" + kid + "' is PKCS#1; convert it with "
                    + "`openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem`");
        }
        String base64 = pem.replaceAll("-----(BEGIN|END) [A-Z ]+-----", "").replaceAll("\\s", "");
        try {
            KeyFactory factory = KeyFactory.getInstance("RSA");
            RSAPrivateCrtKey privateKey = (RSAPrivateCrtKey) factory.generatePrivate(
                    new PKCS8EncodedKeySpec(Base64.getDecoder().decode(base64)));
            RSAPublicKey publicKey = (RSAPublicKey) factory.generatePublic(
                    new RSAPublicKeySpec(privateKey.getModulus(), privateKey.getPublicExponent()));
            return new RSAKey.Builder(publicKey)
                    .privateKey(privateKey)
                    .keyID(kid)
                    .keyUse(KeyUse.SIGNATURE)
                    .algorithm(JWSAlgorithm.RS256)
                    .build();
        } catch (GeneralSecurityException | IllegalArgumentException | ClassCastException e) {
            throw new IllegalStateException("Signing key '" + kid + "' is not a valid PKCS#8 RSA private key", e);
        }
    }

    private static RSAKey generateEphemeral() {
        try {
            return new RSAKeyGenerator(EPHEMERAL_KEY_BITS)
                    .keyID("ephemeral-" + UUID.randomUUID())
                    .keyUse(KeyUse.SIGNATURE)
                    .algorithm(JWSAlgorithm.RS256)
                    .generate();
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not generate an ephemeral signing key", e);
        }
    }
}
