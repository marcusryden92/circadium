package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.ExternalCalendarSource;
import app.circadium.persistence.entity.ExternalEvent;
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
import static org.junit.jupiter.api.Assertions.assertFalse;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class ExternalEventRepositoryTest {

    @Autowired
    ExternalEventRepository externalEventRepository;

    @Autowired
    ExternalCalendarSourceRepository externalCalendarSourceRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadExternalEvent() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("external-event-owner@example.com");
        userRepository.saveAndFlush(user);

        String sourceId = UUID.randomUUID().toString();
        ExternalCalendarSource source = new ExternalCalendarSource();
        source.setId(sourceId);
        source.setUserId(userId);
        source.setKind(ExternalCalendarKind.ICS);
        source.setUrl("https://example.com/feed.ics");
        source.setName("Team feed");
        source.setEnabled(true);
        source.setMode(ExternalCalendarMode.BUSY);
        source.setCreatedAt(Instant.parse("2026-11-16T08:00:00Z"));
        source.setUpdatedAt(Instant.parse("2026-11-16T08:00:00Z"));
        externalCalendarSourceRepository.saveAndFlush(source);

        String id = sourceId + "|uid-123|2026-11-16T09:00:00.000Z";
        ExternalEvent event = new ExternalEvent();
        event.setId(id);
        event.setSourceId(sourceId);
        event.setUserId(userId);
        event.setUid("uid-123");
        event.setTitle("Standup");
        event.setStart("2026-11-16T09:00:00.000Z");
        event.setEnd("2026-11-16T09:15:00.000Z");
        event.setAllDay(false);

        externalEventRepository.saveAndFlush(event);
        entityManager.clear();

        ExternalEvent loaded = externalEventRepository.findById(id).orElseThrow();
        assertEquals("uid-123", loaded.getUid());
        assertEquals("Standup", loaded.getTitle());
        assertEquals("2026-11-16T09:00:00.000Z", loaded.getStart());
        assertFalse(loaded.isAllDay());
    }
}
