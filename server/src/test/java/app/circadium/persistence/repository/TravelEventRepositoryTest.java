package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.TravelEvent;
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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class TravelEventRepositoryTest {

    @Autowired
    TravelEventRepository travelEventRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadTravelEvent() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("travel-event-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = "anywhere-anywhere-2026-11-16T09:00:00.000Z";
        TravelEvent event = new TravelEvent();
        event.setId(id);
        event.setStart("2026-11-16T09:00:00.000Z");
        event.setEnd("2026-11-16T09:25:00.000Z");
        event.setTravelMinutes(25);
        event.setInsufficientTravel(true);
        event.setOverconstrained(false);
        event.setUserId(userId);
        event.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        event.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));

        travelEventRepository.saveAndFlush(event);
        entityManager.clear();

        TravelEvent loaded = travelEventRepository.findById(id).orElseThrow();
        assertEquals("2026-11-16T09:00:00.000Z", loaded.getStart());
        assertEquals(25, loaded.getTravelMinutes());
        assertNull(loaded.getRequiredTravelMinutes());
        assertNull(loaded.getFromLocationId());
        assertTrue(loaded.isInsufficientTravel());
        assertFalse(loaded.isOverconstrained());
    }
}
