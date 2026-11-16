package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.entity.VerificationToken;
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
class VerificationTokenRepositoryTest {

    @Autowired
    VerificationTokenRepository verificationTokenRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadVerificationToken() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("verification-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        VerificationToken token = new VerificationToken();
        token.setId(id);
        token.setEmail("verification-owner@example.com");
        token.setToken("verify-token-abc");
        token.setExpires(Instant.parse("2026-11-16T09:00:00Z"));
        token.setUserId(userId);

        verificationTokenRepository.saveAndFlush(token);
        entityManager.clear();

        VerificationToken loaded = verificationTokenRepository.findById(id).orElseThrow();
        assertEquals("verification-owner@example.com", loaded.getEmail());
        assertEquals("verify-token-abc", loaded.getToken());
        assertEquals(Instant.parse("2026-11-16T09:00:00Z"), loaded.getExpires());
        assertEquals(userId, loaded.getUserId());
    }
}
