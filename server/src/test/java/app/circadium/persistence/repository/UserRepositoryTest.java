package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.AiMode;
import app.circadium.persistence.enums.UserRole;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional 
class UserRepositoryTest {
    
    @Autowired
    UserRepository userRepository;

    @Autowired 
    EntityManager entityManager;

    @Test 
    void persistAndReloadUser() {
        String id = UUID.randomUUID().toString();
        Instant verifiedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        User user = new User();
        user.setId(id);
        user.setEmail("round-trip@example.com");
        user.setRole(UserRole.USER);
        user.setAiMode(AiMode.BYOK);
        user.setTwoFactorEnabled(true);
        user.setDataVersion(3);
        user.setEmailVerified(verifiedAt);

        userRepository.saveAndFlush(user);
        entityManager.clear();

        User loaded = userRepository.findById(id).orElseThrow();
        assertEquals("round-trip@example.com", loaded.getEmail());
        assertEquals(UserRole.USER, loaded.getRole());
        assertEquals(AiMode.BYOK, loaded.getAiMode());
        assertTrue(loaded.isTwoFactorEnabled());
        assertEquals(3, loaded.getDataVersion());
        assertEquals(verifiedAt, loaded.getEmailVerified());
    }
}
