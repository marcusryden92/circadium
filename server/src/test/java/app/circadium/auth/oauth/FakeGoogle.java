package app.circadium.auth.oauth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import org.springframework.security.oauth2.client.registration.ClientRegistration;

/**
 * Stands in for Google's token and key-set endpoints so a whole sign-in runs without the network. ID tokens are
 * really signed (RS256) and verified by Spring against {@code /jwks}, exactly as Google's would be.
 */
final class FakeGoogle implements AutoCloseable {

    static final String CLIENT_ID = "test-client-id.apps.googleusercontent.com";

    /** Who signs in next. {@code subject} is Google's stable account id ({@code sub}). */
    record Identity(String subject, String email, boolean emailVerified, String name) {}

    private final HttpServer server;
    private final RSAKey signingKey;
    private volatile Identity nextIdentity;
    private volatile String nextNonce;
    private volatile Map<String, String> lastTokenRequest = Map.of();

    private FakeGoogle() throws IOException, JOSEException {
        signingKey = new RSAKeyGenerator(2048).keyID("fake-google").generate();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/token", this::token);
        server.createContext("/jwks", exchange -> respond(exchange, new JWKSet(signingKey.toPublicJWK()).toString()));
        server.start();
    }

    static FakeGoogle start() {
        try {
            return new FakeGoogle();
        } catch (IOException | JOSEException e) {
            throw new IllegalStateException("Could not start the fake Google endpoints", e);
        }
    }

    String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /**
     * The production registration with only Google's endpoints swapped, so PKCE, scopes and the redirect URI under
     * test are the real ones. No user-info endpoint: the ID token carries every claim sign-in reads.
     */
    ClientRegistration registration(OAuthProperties properties) {
        return ClientRegistration.withClientRegistration(OAuthClientConfig.googleRegistration(properties))
                .authorizationUri(baseUrl() + "/authorize")
                .tokenUri(baseUrl() + "/token")
                .jwkSetUri(baseUrl() + "/jwks")
                .issuerUri(baseUrl())
                .userInfoUri(null)
                .build();
    }

    /** @param nonce the {@code nonce} Spring sent in the authorization redirect; the ID token must echo it */
    void willSignIn(Identity identity, String nonce) {
        this.nextIdentity = identity;
        this.nextNonce = nonce;
    }

    /** The form parameters of the most recent token request, as Spring sent them. */
    Map<String, String> lastTokenRequest() {
        return lastTokenRequest;
    }

    @Override
    public void close() {
        server.stop(0);
    }

    private void token(HttpExchange exchange) throws IOException {
        lastTokenRequest = parseForm(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        respond(exchange, """
                {"access_token":"fake-access-token","token_type":"Bearer","expires_in":3599,\
                "scope":"openid email profile","id_token":"%s"}""".formatted(idToken(nextIdentity, nextNonce)));
    }

    private String idToken(Identity identity, String nonce) {
        Instant now = Instant.now();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(baseUrl())
                .subject(identity.subject())
                .audience(CLIENT_ID)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(300)))
                .claim("nonce", nonce)
                .claim("email", identity.email())
                .claim("email_verified", identity.emailVerified())
                .claim("name", identity.name())
                .build();
        SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(signingKey.getKeyID()).build(), claims);
        try {
            jwt.sign(new RSASSASigner(signingKey));
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
        return jwt.serialize();
    }

    private static Map<String, String> parseForm(String body) {
        Map<String, String> form = new HashMap<>();
        for (String pair : body.split("&")) {
            int separator = pair.indexOf('=');
            if (separator > 0) {
                form.put(URLDecoder.decode(pair.substring(0, separator), StandardCharsets.UTF_8),
                        URLDecoder.decode(pair.substring(separator + 1), StandardCharsets.UTF_8));
            }
        }
        return form;
    }

    private static void respond(HttpExchange exchange, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json;charset=UTF-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}
