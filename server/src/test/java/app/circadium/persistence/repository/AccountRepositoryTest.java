package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Account;
import app.circadium.persistence.entity.User;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class AccountRepositoryTest {

    @Autowired
    AccountRepository accountRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadAccount() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("account-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        Account account = new Account();
        account.setId(id);
        account.setUserId(userId);
        account.setType("oauth");
        account.setProvider("github");
        account.setProviderAccountId("gh-12345");
        account.setRefreshToken("refresh-token-value");
        account.setAccessToken("access-token-value");
        account.setExpiresAt(1800);
        account.setTokenType("bearer");
        account.setScope("read:user");

        accountRepository.saveAndFlush(account);
        entityManager.clear();

        Account loaded = accountRepository.findById(id).orElseThrow();
        assertEquals(userId, loaded.getUserId());
        assertEquals("github", loaded.getProvider());
        assertEquals("gh-12345", loaded.getProviderAccountId());
        assertEquals("refresh-token-value", loaded.getRefreshToken());
        assertEquals(1800, loaded.getExpiresAt());
    }
}
