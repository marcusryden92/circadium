package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.AccountDeletionToken;
import app.circadium.persistence.entity.User;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class AccountDeletionTokenRepositoryTest {

    @Autowired
    AccountDeletionTokenRepository accountDeletionTokenRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadAccountDeletionToken() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("deletion-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        AccountDeletionToken token = new AccountDeletionToken();
        token.setId(id);
        token.setUserId(userId);
        token.setToken("deletion-token-abc");
        token.setExpires(Instant.parse("2026-11-16T09:00:00Z"));

        accountDeletionTokenRepository.saveAndFlush(token);
        entityManager.clear();

        AccountDeletionToken loaded = accountDeletionTokenRepository.findById(id).orElseThrow();
        assertEquals(userId, loaded.getUserId());
        assertEquals("deletion-token-abc", loaded.getToken());
        assertEquals(Instant.parse("2026-11-16T09:00:00Z"), loaded.getExpires());
    }
}
