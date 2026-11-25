package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.OccurrenceCompletion;
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

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class OccurrenceCompletionRepositoryTest {

    @Autowired
    OccurrenceCompletionRepository occurrenceCompletionRepository;

    @Autowired
    PlannerRepository plannerRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadOccurrenceCompletion() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("completion-owner@example.com");
        userRepository.saveAndFlush(user);

        String plannerId = UUID.randomUUID().toString();
        Planner planner = new Planner();
        planner.setId(plannerId);
        planner.setTitle("Meditate");
        planner.setPlannerType(PlannerType.task);
        planner.setUserId(userId);
        planner.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        planner.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        plannerRepository.saveAndFlush(planner);

        String id = UUID.randomUUID().toString();
        OccurrenceCompletion completion = new OccurrenceCompletion();
        completion.setId(id);
        completion.setPlannerId(plannerId);
        completion.setUserId(userId);
        completion.setOccurrenceKey("2026-11-16T07:00");
        completion.setStart("2026-11-16T07:00:00.000Z");
        completion.setEnd("2026-11-16T07:20:00.000Z");
        completion.setCreatedAt(Instant.parse("2026-11-16T07:20:00.000Z"));

        occurrenceCompletionRepository.saveAndFlush(completion);
        entityManager.clear();

        OccurrenceCompletion loaded = occurrenceCompletionRepository.findById(id).orElseThrow();
        assertEquals(plannerId, loaded.getPlannerId());
        assertEquals("2026-11-16T07:00", loaded.getOccurrenceKey());
        assertEquals("2026-11-16T07:20:00.000Z", loaded.getEnd());
    }
}
