package app.circadium.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Account;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.AccountRepository;
import app.circadium.persistence.repository.UserRepository;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

/**
 * {@code GET /auth/session} is what the web's server components render from after the Prisma cutover (plan 2.6):
 * it must mirror the retired {@code lib/session/session.ts} DB checks — authoritative user row, 401 for a deleted
 * account or a token issued before the last password change (same-second accepted) — and carry the protected
 * layout's profile reads.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SessionEndpointIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    TokenService tokenService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    AccountRepository accountRepository;

    @Test
    void answersTheFullSessionForACredentialsUser() throws Exception {
        User user = newUser();
        user.setName("Session User");
        user.setOnboardedAt(Instant.parse("2026-01-02T03:04:05.000Z"));
        userRepository.saveAndFlush(user);
        String accessToken = tokenService.startSession(user, null).accessToken();

        mockMvc.perform(get("/auth/session").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.id").value(user.getId()))
                .andExpect(jsonPath("$.user.name").value("Session User"))
                .andExpect(jsonPath("$.user.email").value(user.getEmail()))
                .andExpect(jsonPath("$.user.role").value("USER"))
                .andExpect(jsonPath("$.user.isTwoFactorEnabled").value(false))
                .andExpect(jsonPath("$.user.isOAuth").value(false))
                .andExpect(jsonPath("$.user.signInProviders").isEmpty())
                .andExpect(jsonPath("$.user.onboardedAt").value("2026-01-02T03:04:05Z"))
                .andExpect(jsonPath("$.user.aiMode").value((String) null))
                .andExpect(jsonPath("$.accessTokenExpiresAt").isNotEmpty())
                .andExpect(jsonPath("$.twoFactorVerified").value(false));
    }

    @Test
    void listsProviderSignInsAndMarksTheAccountOAuth() throws Exception {
        User user = newUser();
        Account account = new Account();
        account.setId(UUID.randomUUID().toString());
        account.setUserId(user.getId());
        account.setType("oidc");
        account.setProvider("google");
        account.setProviderAccountId(UUID.randomUUID().toString());
        accountRepository.saveAndFlush(account);
        String accessToken = tokenService.startSession(user, null).accessToken();

        mockMvc.perform(get("/auth/session").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.isOAuth").value(true))
                .andExpect(jsonPath("$.user.signInProviders[0]").value("google"));
    }

    @Test
    void carriesTheTwoFactorVerifiedSignInMarker() throws Exception {
        User user = newUser();
        String accessToken = tokenService.startSession(user, null, true).accessToken();

        mockMvc.perform(get("/auth/session").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.twoFactorVerified").value(true));
    }

    @Test
    void rejectsATokenIssuedBeforeThePasswordChanged() throws Exception {
        User user = newUser();
        String accessToken = tokenService.startSession(user, null).accessToken();
        // Well past the token's same-second ambiguity window, like a change minutes after sign-in.
        user.setPasswordChangedAt(Instant.now().plusSeconds(120));
        userRepository.saveAndFlush(user);

        mockMvc.perform(get("/auth/session").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("session_ended"));
    }

    @Test
    void acceptsATokenFromTheSameSecondAsThePasswordChange() throws Exception {
        User user = newUser();
        IssuedTokens tokens = tokenService.startSession(user, null);
        // JWT iat has second granularity: a change in the issue second is ambiguous and must pass,
        // because the sign-in right after a reset lands there (the web's getSession rule).
        user.setPasswordChangedAt(Instant.ofEpochSecond(Instant.now().getEpochSecond()));
        userRepository.saveAndFlush(user);

        mockMvc.perform(get("/auth/session").header(HttpHeaders.AUTHORIZATION, "Bearer " + tokens.accessToken()))
                .andExpect(status().isOk());
    }

    @Test
    void rejectsATokenForADeletedAccount() throws Exception {
        User user = newUser();
        String accessToken = tokenService.startSession(user, null).accessToken();
        userRepository.delete(user);

        mockMvc.perform(get("/auth/session").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isUnauthorized());
    }

    private User newUser() {
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setEmail(UUID.randomUUID() + "@example.com");
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(false);
        user.setDataVersion(0);
        return userRepository.saveAndFlush(user);
    }
}
