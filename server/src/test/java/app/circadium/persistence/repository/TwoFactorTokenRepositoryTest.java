package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.TwoFactorToken;
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
class TwoFactorTokenRepositoryTest {

    @Autowired
    TwoFactorTokenRepository twoFactorTokenRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadTwoFactorToken() {
        String id = UUID.randomUUID().toString();
        TwoFactorToken token = new TwoFactorToken();
        token.setId(id);
        token.setEmail("two-factor@example.com");
        token.setToken("123456");
        token.setExpires(Instant.parse("2026-11-16T09:00:00Z"));

        twoFactorTokenRepository.saveAndFlush(token);
        entityManager.clear();

        TwoFactorToken loaded = twoFactorTokenRepository.findById(id).orElseThrow();
        assertEquals("two-factor@example.com", loaded.getEmail());
        assertEquals("123456", loaded.getToken());
        assertEquals(Instant.parse("2026-11-16T09:00:00Z"), loaded.getExpires());
    }
}
