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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.security.oauth2.client.registration.ClientRegistration;

/**
 * Stands in for a provider's token, key-set and revoke endpoints so a whole sign-in runs without the network. ID
 * tokens are really signed (RS256) and verified by Spring against {@code /jwks}, exactly as the provider's would
 * be. The registration under test is the production one with only the endpoints swapped, so scopes, PKCE and the
 * redirect URI are the real ones.
 */
final class FakeProvider {

    /** Microsoft's tenant id for personal accounts. */
    static final String CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

    /**
     * Who signs in next: the ID token's claims apart from those the fake fills in ({@code iss}, {@code aud},
     * {@code iat}, {@code exp}, {@code nonce}). An {@code iss} claim here overrides the fake's.
     */
    record Identity(String subject, Map<String, Object> claims) {

        static Identity google(String subject, String email, boolean emailVerified, String name) {
            return new Identity(subject, claims("email", email, "email_verified", emailVerified, "name", name));
        }

        /** {@code sub} is pairwise per app; sign-in must key on {@code oid}, so it gets a value of its own. */
        static Identity microsoft(String objectId, String email, String name) {
            return new Identity("pairwise-" + objectId, claims("oid", objectId, "tid", CONSUMER_TENANT,
                    "email", email, "name", name, "preferred_username", email));
        }

        /** Apple documents {@code email_verified} as a string or a boolean; it sends the string. */
        static Identity apple(String subject, String email, Object emailVerified) {
            return new Identity(subject, claims("email", email, "email_verified", emailVerified,
                    "is_private_email", "false"));
        }

        Identity with(String claim, Object value) {
            Map<String, Object> copy = new LinkedHashMap<>(claims);
            if (value == null) {
                copy.remove(claim);
            } else {
                copy.put(claim, value);
            }
            return new Identity(subject, copy);
        }

        private static Map<String, Object> claims(Object... pairs) {
            Map<String, Object> claims = new LinkedHashMap<>();
            for (int i = 0; i < pairs.length; i += 2) {
                if (pairs[i + 1] != null) {
                    claims.put((String) pairs[i], pairs[i + 1]);
                }
            }
            return claims;
        }
    }

    private final SignInProvider provider;
    private final String clientId;
    private final HttpServer server;
    private final RSAKey signingKey;
    private volatile Identity nextIdentity;
    private volatile String nextNonce;
    private volatile String nextRefreshToken;
    private volatile Map<String, String> lastTokenRequest = Map.of();
    private final List<Map<String, String>> revokeRequests = new CopyOnWriteArrayList<>();

    private FakeProvider(SignInProvider provider, String clientId) throws IOException, JOSEException {
        this.provider = provider;
        this.clientId = clientId;
        signingKey = new RSAKeyGenerator(2048).keyID("fake-" + provider.registrationId()).generate();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/token", this::token);
        server.createContext("/revoke", this::revoke);
        server.createContext("/jwks", exchange -> respond(exchange, new JWKSet(signingKey.toPublicJWK()).toString()));
        server.start();
    }

    /** One per provider for the whole test run: the Spring context that points at it is shared between classes. */
    static FakeProvider start(SignInProvider provider, String clientId) {
        try {
            return new FakeProvider(provider, clientId);
        } catch (IOException | JOSEException e) {
            throw new IllegalStateException("Could not start the fake " + provider.displayName() + " endpoints", e);
        }
    }

    String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    String clientId() {
        return clientId;
    }

    String microsoftIssuer(String tenantId) {
        return baseUrl() + "/" + tenantId + "/v2.0";
    }

    ClientRegistration registration(OAuthProperties properties) {
        ClientRegistration.Builder builder =
                ClientRegistration.withClientRegistration(OAuthClientConfig.registration(provider, properties))
                        .authorizationUri(baseUrl() + "/authorize")
                        .tokenUri(baseUrl() + "/token")
                        .jwkSetUri(baseUrl() + "/jwks")
                        .userInfoUri(null);
        if (provider == SignInProvider.MICROSOFT) {
            builder.providerConfigurationMetadata(Map.of(OAuthClientConfig.ISSUER_METADATA,
                    microsoftIssuer(MicrosoftIssuerValidator.TENANT_PLACEHOLDER)));
        } else {
            builder.issuerUri(baseUrl());
        }
        return builder.build();
    }

    /**
     * @param nonce the {@code nonce} Spring sent in the authorization redirect; the ID token must echo it
     * @param refreshToken returned by the token endpoint when not null (Apple issues one)
     */
    void willSignIn(Identity identity, String nonce, String refreshToken) {
        this.nextIdentity = identity;
        this.nextNonce = nonce;
        this.nextRefreshToken = refreshToken;
    }

    /** The form parameters of the most recent token request, as Spring sent them. */
    Map<String, String> lastTokenRequest() {
        return lastTokenRequest;
    }

    List<Map<String, String>> revokeRequests() {
        return List.copyOf(revokeRequests);
    }

    private void token(HttpExchange exchange) throws IOException {
        lastTokenRequest = parseForm(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        String refresh = nextRefreshToken == null ? "" : ",\"refresh_token\":\"" + nextRefreshToken + "\"";
        respond(exchange, """
                {"access_token":"fake-access-token","token_type":"Bearer","expires_in":3599%s,"id_token":"%s"}"""
                .formatted(refresh, idToken(nextIdentity, nextNonce)));
    }

    private void revoke(HttpExchange exchange) throws IOException {
        revokeRequests.add(parseForm(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
        exchange.sendResponseHeaders(200, -1);
        exchange.close();
    }

    private String idToken(Identity identity, String nonce) {
        Instant now = Instant.now();
        String issuer = provider == SignInProvider.MICROSOFT
                ? microsoftIssuer(String.valueOf(identity.claims().get("tid")))
                : baseUrl();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(issuer)
                .subject(identity.subject())
                .audience(clientId)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(300)))
                .claim("nonce", nonce);
        identity.claims().forEach(claims::claim);
        SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(signingKey.getKeyID()).build(), claims.build());
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
