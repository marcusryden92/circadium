package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.ExternalCalendarSource;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.ExternalCalendarKind;
import app.circadium.persistence.enums.ExternalCalendarMode;
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
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class ExternalCalendarSourceRepositoryTest {

    @Autowired
    ExternalCalendarSourceRepository externalCalendarSourceRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadExternalCalendarSource() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("external-source-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        ExternalCalendarSource source = new ExternalCalendarSource();
        source.setId(id);
        source.setUserId(userId);
        source.setKind(ExternalCalendarKind.GOOGLE);
        source.setUrl("primary");
        source.setName("Work calendar");
        source.setEnabled(true);
        source.setMode(ExternalCalendarMode.BUSY);
        source.setCreatedAt(Instant.parse("2026-11-16T08:00:00Z"));
        source.setUpdatedAt(Instant.parse("2026-11-16T08:00:00Z"));

        externalCalendarSourceRepository.saveAndFlush(source);
        entityManager.clear();

        ExternalCalendarSource loaded = externalCalendarSourceRepository.findById(id).orElseThrow();
        assertEquals(ExternalCalendarKind.GOOGLE, loaded.getKind());
        assertEquals(ExternalCalendarMode.BUSY, loaded.getMode());
        assertEquals("Work calendar", loaded.getName());
        assertTrue(loaded.isEnabled());
        assertNull(loaded.getLocationId());
        assertNull(loaded.getLastFetchedAt());
    }
}
