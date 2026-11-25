package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.EventExtendedProps;
import app.circadium.persistence.entity.SimpleEvent;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.EventType;
import app.circadium.persistence.enums.PlannerType;
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
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class EventExtendedPropsRepositoryTest {

    @Autowired
    EventExtendedPropsRepository extendedPropsRepository;

    @Autowired
    SimpleEventRepository simpleEventRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadExtendedProps() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("props-owner@example.com");
        userRepository.saveAndFlush(user);

        String eventId = UUID.randomUUID().toString();
        SimpleEvent event = new SimpleEvent();
        event.setId(eventId);
        event.setTitle("Placed goal leaf");
        event.setStart(Instant.parse("2026-11-16T09:00:00.000Z"));
        event.setEnd(Instant.parse("2026-11-16T10:00:00.000Z"));
        event.setUserId(userId);
        event.setBackgroundColor("#111111");
        event.setBorderColor("#222222");
        event.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        event.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        simpleEventRepository.saveAndFlush(event);

        String id = UUID.randomUUID().toString();
        EventExtendedProps props = new EventExtendedProps();
        props.setId(id);
        props.setEventId(eventId);
        props.setEventType(EventType.category);
        props.setPlannerType(PlannerType.task);
        props.setTrespassingStart(true);
        props.setTrespassingEnd(false);

        extendedPropsRepository.saveAndFlush(props);
        entityManager.clear();

        EventExtendedProps loaded = extendedPropsRepository.findById(id).orElseThrow();
        assertEquals(eventId, loaded.getEventId());
        assertEquals(EventType.category, loaded.getEventType());
        assertEquals(PlannerType.task, loaded.getPlannerType());
        assertTrue(loaded.isTrespassingStart());
        assertFalse(loaded.isTrespassingEnd());
    }
}
