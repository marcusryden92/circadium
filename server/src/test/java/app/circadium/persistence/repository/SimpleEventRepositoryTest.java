package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.SimpleEvent;
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
import static org.junit.jupiter.api.Assertions.assertNull;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class SimpleEventRepositoryTest {

    @Autowired
    SimpleEventRepository simpleEventRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadSimpleEvent() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("event-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        SimpleEvent event = new SimpleEvent();
        event.setId(id);
        event.setTitle("Deep work block");
        event.setStart(Instant.parse("2026-11-16T09:00:00.000Z"));
        event.setEnd(Instant.parse("2026-11-16T10:30:00.000Z"));
        event.setUserId(userId);
        event.setBackgroundColor("#336699");
        event.setBorderColor("#224466");
        event.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        event.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));

        simpleEventRepository.saveAndFlush(event);
        entityManager.clear();

        SimpleEvent loaded = simpleEventRepository.findById(id).orElseThrow();
        assertEquals("Deep work block", loaded.getTitle());
        assertEquals(Instant.parse("2026-11-16T09:00:00.000Z"), loaded.getStart());
        assertEquals("#336699", loaded.getBackgroundColor());
        assertNull(loaded.getDuration());
        assertNull(loaded.getRrule());
    }
}
