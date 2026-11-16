package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.EventTemplate;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.WeekDayType;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class EventTemplateRepositoryTest {

    @Autowired
    EventTemplateRepository eventTemplateRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadEventTemplate() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("template-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        EventTemplate template = new EventTemplate();
        template.setId(id);
        template.setTitle("Work hours");
        template.setStartDay(WeekDayType.wednesday);
        template.setStartTime("09:00");
        template.setUserId(userId);
        template.setDuration(480);
        template.setCreatedAt("2026-11-16T08:00:00.000Z");
        template.setUpdatedAt("2026-11-16T08:00:00.000Z");

        eventTemplateRepository.saveAndFlush(template);
        entityManager.clear();

        EventTemplate loaded = eventTemplateRepository.findById(id).orElseThrow();
        assertEquals("Work hours", loaded.getTitle());
        assertEquals(WeekDayType.wednesday, loaded.getStartDay());
        assertEquals("09:00", loaded.getStartTime());
        assertEquals(480, loaded.getDuration());
        assertNull(loaded.getLocationId());
    }
}
