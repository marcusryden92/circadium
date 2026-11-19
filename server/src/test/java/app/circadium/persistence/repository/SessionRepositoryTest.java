package app.circadium.persistence.repository;

import static org.assertj.core.api.Assertions.assertThat;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Session;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class SessionRepositoryTest {

    @Autowired
    SessionRepository sessionRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void roundTrip() {
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(false);
        user.setDataVersion(0);
        userRepository.saveAndFlush(user);

        Session session = new Session();
        session.setId(UUID.randomUUID().toString());
        session.setUserId(user.getId());
        session.setTokenHash("abc123hash");
        session.setExpiresAt(Instant.now().plus(30, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS));
        session.setLastUsedAt(Instant.now().truncatedTo(ChronoUnit.MILLIS));
        session.setDeviceName("Chrome on Windows");
        session.setCreatedAt(Instant.now().truncatedTo(ChronoUnit.MILLIS));
        sessionRepository.saveAndFlush(session);

        entityManager.clear();

        Session found = sessionRepository.findByTokenHash("abc123hash").orElseThrow();
        assertThat(found.getUserId()).isEqualTo(user.getId());
        assertThat(found.getDeviceName()).isEqualTo("Chrome on Windows");
        assertThat(found.getReplacedBy()).isNull();
        assertThat(found.getExpiresAt()).isAfter(Instant.now());
    }
}
