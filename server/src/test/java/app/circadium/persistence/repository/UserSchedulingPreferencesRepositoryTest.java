package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.entity.UserSchedulingPreferences;
import app.circadium.persistence.enums.TransportMode;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class UserSchedulingPreferencesRepositoryTest {

    @Autowired
    UserSchedulingPreferencesRepository userSchedulingPreferencesRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadUserSchedulingPreferences() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("prefs-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        UserSchedulingPreferences prefs = new UserSchedulingPreferences();
        prefs.setId(id);
        prefs.setUserId(userId);
        prefs.setBufferTimeMinutes(15);
        prefs.setDefaultTransportMode(TransportMode.TRANSIT);
        prefs.setWeekStartDay(0);
        prefs.setCreatedAt(Instant.parse("2026-11-16T08:00:00Z"));
        prefs.setUpdatedAt(Instant.parse("2026-11-16T08:00:00Z"));

        userSchedulingPreferencesRepository.saveAndFlush(prefs);
        entityManager.clear();

        UserSchedulingPreferences loaded = userSchedulingPreferencesRepository.findById(id).orElseThrow();
        assertEquals(15, loaded.getBufferTimeMinutes());
        assertEquals(TransportMode.TRANSIT, loaded.getDefaultTransportMode());
        assertEquals(0, loaded.getWeekStartDay());
        assertNull(loaded.getLastTravelRefreshAt());
    }
}
