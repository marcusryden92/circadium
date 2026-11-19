package app.circadium.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.UserRepository;
import com.jayway.jsonpath.JsonPath;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.web.servlet.MockMvc;

/** The 1.5 resource-server probe: {@code /auth/me} accepts only well-formed, current, correctly-signed tokens. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AuthEndpointsIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    TokenService tokenService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    JwtEncoder jwtEncoder;

    @Autowired
    SigningKeys signingKeys;

    @Autowired
    AuthProperties properties;

    @Test
    void jwksPublishesPublicKeysOnly() throws Exception {
        mockMvc.perform(get("/.well-known/jwks.json"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "max-age=300, public"))
                .andExpect(jsonPath("$.keys[0].kid").value(signingKeys.activeKeyId()))
                .andExpect(jsonPath("$.keys[0].kty").value("RSA"))
                .andExpect(jsonPath("$.keys[0].n").isNotEmpty())
                .andExpect(jsonPath("$.keys[0].d").doesNotExist());
    }

    @Test
    void probeAcceptsAValidAccessToken() throws Exception {
        User user = newUser();
        IssuedTokens tokens = tokenService.startSession(user, null);

        mockMvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + tokens.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(user.getId()))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.sessionId").isNotEmpty());
    }

    @Test
    void probeRejectsMissingToken() throws Exception {
        mockMvc.perform(get("/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void probeRejectsExpiredToken() throws Exception {
        Instant issued = Instant.now().minusSeconds(30 * 60);
        String token = sign(claims(properties.issuer(), properties.audience(), issued, issued.plusSeconds(15 * 60)));
        expectRejected(token);
    }

    @Test
    void probeRejectsWrongAudience() throws Exception {
        expectRejected(sign(claims(properties.issuer(), "some-other-api", Instant.now(), Instant.now().plusSeconds(600))));
    }

    @Test
    void probeRejectsWrongIssuer() throws Exception {
        expectRejected(sign(claims("https://evil.example", properties.audience(), Instant.now(), Instant.now().plusSeconds(600))));
    }

    @Test
    void probeRejectsTokenSignedByAnUnknownKey() throws Exception {
        RSAKey rogue = new RSAKeyGenerator(2048).keyID("rogue").algorithm(JWSAlgorithm.RS256).generate();
        JwtClaimsSet claims = claims(properties.issuer(), properties.audience(), Instant.now(), Instant.now().plusSeconds(600));
        expectRejected(signWith(rogue, "rogue", claims));
    }

    @Test
    void probeRejectsForgedTokenClaimingTheActiveKeyId() throws Exception {
        RSAKey rogue = new RSAKeyGenerator(2048).keyID(signingKeys.activeKeyId()).algorithm(JWSAlgorithm.RS256).generate();
        JwtClaimsSet claims = claims(properties.issuer(), properties.audience(), Instant.now(), Instant.now().plusSeconds(600));
        expectRejected(signWith(rogue, signingKeys.activeKeyId(), claims));
    }

    @Test
    void refreshEndpointRotatesAndRevokesTheChainOnReuse() throws Exception {
        IssuedTokens first = tokenService.startSession(newUser(), null);

        String body = mockMvc.perform(refreshRequest(first.refreshToken()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        String rotated = JsonPath.read(body, "$.refreshToken");

        mockMvc.perform(refreshRequest(first.refreshToken()))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401));
        mockMvc.perform(refreshRequest(rotated)).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutEndpointRevokesTheSession() throws Exception {
        IssuedTokens tokens = tokenService.startSession(newUser(), null);

        mockMvc.perform(post("/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshBody(tokens.refreshToken())))
                .andExpect(status().isNoContent());
        mockMvc.perform(refreshRequest(tokens.refreshToken())).andExpect(status().isUnauthorized());
    }

    @Test
    void refreshEndpointValidatesTheBody() throws Exception {
        mockMvc.perform(post("/auth/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.refreshToken").isNotEmpty());
    }

    private void expectRejected(String token) throws Exception {
        mockMvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(header().exists(HttpHeaders.WWW_AUTHENTICATE));
    }

    private static JwtClaimsSet claims(String issuer, String audience, Instant issuedAt, Instant expiresAt) {
        return JwtClaimsSet.builder()
                .issuer(issuer)
                .subject(UUID.randomUUID().toString())
                .audience(List.of(audience))
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("role", "USER")
                .build();
    }

    private String sign(JwtClaimsSet claims) {
        JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256).keyId(signingKeys.activeKeyId()).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    private static String signWith(RSAKey key, String kid, JwtClaimsSet claims) {
        NimbusJwtEncoder encoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(key)));
        JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256).keyId(kid).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    private static org.springframework.test.web.servlet.RequestBuilder refreshRequest(String refreshToken) {
        return post("/auth/refresh").contentType(MediaType.APPLICATION_JSON).content(refreshBody(refreshToken));
    }

    private static String refreshBody(String refreshToken) {
        return "{\"refreshToken\":\"" + refreshToken + "\"}";
    }

    private User newUser() {
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(false);
        user.setDataVersion(0);
        return userRepository.saveAndFlush(user);
    }
}
