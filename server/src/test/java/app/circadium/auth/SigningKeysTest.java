package app.circadium.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SigningKeysTest {

    @Test
    void parsesPkcs8PemAndPublishesOnlyPublicParts() throws Exception {
        KeyPair pair = generateKeyPair();
        SigningKeys keys = SigningKeys.from(properties(false,
                new AuthProperties.SigningKey("k1", toPkcs8Pem(pair))));

        assertThat(keys.activeKeyId()).isEqualTo("k1");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> published = (List<Map<String, Object>>) keys.publicJwkSet().get("keys");
        assertThat(published).hasSize(1);
        Map<String, Object> jwk = published.getFirst();
        assertThat(jwk).containsEntry("kid", "k1").containsEntry("kty", "RSA").containsEntry("alg", "RS256");
        assertThat(jwk).doesNotContainKeys("d", "p", "q", "dp", "dq", "qi");
        assertThat(SigningKeys.parse("k1", toPkcs8Pem(pair)).toRSAPublicKey()).isEqualTo(pair.getPublic());
    }

    @Test
    void firstConfiguredKeySignsAndAllArePublished() throws Exception {
        SigningKeys keys = SigningKeys.from(properties(false,
                new AuthProperties.SigningKey("new", toPkcs8Pem(generateKeyPair())),
                new AuthProperties.SigningKey("old", toPkcs8Pem(generateKeyPair()))));

        assertThat(keys.activeKeyId()).isEqualTo("new");
        assertThat((List<?>) keys.publicJwkSet().get("keys")).hasSize(2);
    }

    @Test
    void rejectsDuplicateKeyIds() throws Exception {
        String pem = toPkcs8Pem(generateKeyPair());
        assertThatThrownBy(() -> SigningKeys.from(properties(false,
                new AuthProperties.SigningKey("same", pem),
                new AuthProperties.SigningKey("same", pem))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Duplicate");
    }

    @Test
    void rejectsPkcs1WithConversionHint() {
        String pkcs1 = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----";
        assertThatThrownBy(() -> SigningKeys.parse("k1", pkcs1))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("openssl pkcs8");
    }

    @Test
    void rejectsGarbage() {
        assertThatThrownBy(() -> SigningKeys.parse("k1", "not a key"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("not a valid PKCS#8");
    }

    @Test
    void noKeysWithoutEphemeralRefusesToStart() {
        assertThatThrownBy(() -> SigningKeys.from(properties(false)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("No JWT signing keys");
    }

    @Test
    void noKeysWithEphemeralGeneratesOne() {
        SigningKeys keys = SigningKeys.from(properties(true));
        assertThat(keys.activeKeyId()).startsWith("ephemeral-");
    }

    private static AuthProperties properties(boolean allowEphemeral, AuthProperties.SigningKey... keys) {
        return new AuthProperties("http://test", "circadium-api", Duration.ofMinutes(15), Duration.ofDays(30),
                allowEphemeral, List.of(keys));
    }

    private static KeyPair generateKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private static String toPkcs8Pem(KeyPair pair) {
        String body = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(pair.getPrivate().getEncoded());
        return "-----BEGIN PRIVATE KEY-----\n" + body + "\n-----END PRIVATE KEY-----\n";
    }
}
