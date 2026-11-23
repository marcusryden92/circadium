package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Planner;
import app.circadium.persistence.entity.User;
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
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class PlannerRepositoryTest {

    @Autowired
    PlannerRepository plannerRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadPlanner() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("planner-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        Planner planner = new Planner();
        planner.setId(id);
        planner.setTitle("Write the backend");
        planner.setPlannerType(PlannerType.goal);
        planner.setIsReady(true);
        planner.setTriaged(true);
        planner.setDuration(60);
        planner.setSortOrder(1024.0);
        planner.setPriority(4);
        planner.setUserId(userId);
        planner.setUseParentLocation(false);
        planner.setCreatedAt(Instant.parse("2026-11-16T10:00:00.000Z"));
        planner.setUpdatedAt(Instant.parse("2026-11-16T10:00:00.000Z"));

        plannerRepository.saveAndFlush(planner);
        entityManager.clear();

        Planner loaded = plannerRepository.findById(id).orElseThrow();
        assertEquals("Write the backend", loaded.getTitle());
        assertEquals(PlannerType.goal, loaded.getPlannerType());
        assertTrue(loaded.getIsReady());
        assertTrue(loaded.isTriaged());
        assertEquals(60, loaded.getDuration());
        assertEquals(1024.0, loaded.getSortOrder());
        assertEquals(4, loaded.getPriority());
    }
}
