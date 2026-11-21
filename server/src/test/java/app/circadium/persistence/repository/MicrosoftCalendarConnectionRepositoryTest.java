package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.MicrosoftCalendarConnection;
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
class MicrosoftCalendarConnectionRepositoryTest {

    @Autowired
    MicrosoftCalendarConnectionRepository microsoftCalendarConnectionRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadMicrosoftCalendarConnection() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("microsoft-conn-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        MicrosoftCalendarConnection connection = new MicrosoftCalendarConnection();
        connection.setId(id);
        connection.setUserId(userId);
        connection.setEmail("connected@outlook.com");
        connection.setRefreshToken("ms-refresh-token");
        connection.setCreatedAt(Instant.parse("2026-11-16T08:00:00Z"));
        connection.setUpdatedAt(Instant.parse("2026-11-16T08:00:00Z"));

        microsoftCalendarConnectionRepository.saveAndFlush(connection);
        entityManager.clear();

        MicrosoftCalendarConnection loaded = microsoftCalendarConnectionRepository.findById(id).orElseThrow();
        assertEquals("connected@outlook.com", loaded.getEmail());
        assertEquals("ms-refresh-token", loaded.getRefreshToken());
    }
}
