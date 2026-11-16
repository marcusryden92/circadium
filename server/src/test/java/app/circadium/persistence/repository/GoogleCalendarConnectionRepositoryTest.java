package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.GoogleCalendarConnection;
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
class GoogleCalendarConnectionRepositoryTest {

    @Autowired
    GoogleCalendarConnectionRepository googleCalendarConnectionRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadGoogleCalendarConnection() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("google-conn-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        GoogleCalendarConnection connection = new GoogleCalendarConnection();
        connection.setId(id);
        connection.setUserId(userId);
        connection.setEmail("connected@gmail.com");
        connection.setRefreshToken("refresh-token-value");
        connection.setCreatedAt(Instant.parse("2026-11-16T08:00:00Z"));
        connection.setUpdatedAt(Instant.parse("2026-11-16T08:00:00Z"));

        googleCalendarConnectionRepository.saveAndFlush(connection);
        entityManager.clear();

        GoogleCalendarConnection loaded = googleCalendarConnectionRepository.findById(id).orElseThrow();
        assertEquals("connected@gmail.com", loaded.getEmail());
        assertEquals("refresh-token-value", loaded.getRefreshToken());
        assertEquals(Instant.parse("2026-11-16T08:00:00Z"), loaded.getCreatedAt());
    }
}
