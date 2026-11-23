package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Planner;
import app.circadium.persistence.entity.PlannerDependency;
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

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class PlannerDependencyRepositoryTest {

    @Autowired
    PlannerDependencyRepository plannerDependencyRepository;

    @Autowired
    PlannerRepository plannerRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadPlannerDependency() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("dependency-owner@example.com");
        userRepository.saveAndFlush(user);

        String predecessorId = seedPlanner(userId, "Predecessor");
        String successorId = seedPlanner(userId, "Successor");

        String id = UUID.randomUUID().toString();
        PlannerDependency dependency = new PlannerDependency();
        dependency.setId(id);
        dependency.setPredecessorId(predecessorId);
        dependency.setSuccessorId(successorId);
        dependency.setUserId(userId);
        dependency.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        dependency.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));

        plannerDependencyRepository.saveAndFlush(dependency);
        entityManager.clear();

        PlannerDependency loaded = plannerDependencyRepository.findById(id).orElseThrow();
        assertEquals(predecessorId, loaded.getPredecessorId());
        assertEquals(successorId, loaded.getSuccessorId());
    }

    private String seedPlanner(String userId, String title) {
        String id = UUID.randomUUID().toString();
        Planner planner = new Planner();
        planner.setId(id);
        planner.setTitle(title);
        planner.setPlannerType(PlannerType.task);
        planner.setUserId(userId);
        planner.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        planner.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        plannerRepository.saveAndFlush(planner);
        return id;
    }
}
