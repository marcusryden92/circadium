package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.PasswordResetToken;
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
class PasswordResetTokenRepositoryTest {

    @Autowired
    PasswordResetTokenRepository passwordResetTokenRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadPasswordResetToken() {
        String id = UUID.randomUUID().toString();
        PasswordResetToken token = new PasswordResetToken();
        token.setId(id);
        token.setEmail("reset@example.com");
        token.setToken("reset-token-xyz");
        token.setExpires(Instant.parse("2026-11-16T09:00:00Z"));

        passwordResetTokenRepository.saveAndFlush(token);
        entityManager.clear();

        PasswordResetToken loaded = passwordResetTokenRepository.findById(id).orElseThrow();
        assertEquals("reset@example.com", loaded.getEmail());
        assertEquals("reset-token-xyz", loaded.getToken());
        assertEquals(Instant.parse("2026-11-16T09:00:00Z"), loaded.getExpires());
    }
}
