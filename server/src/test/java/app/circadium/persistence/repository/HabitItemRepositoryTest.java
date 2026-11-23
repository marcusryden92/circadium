package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Habit;
import app.circadium.persistence.entity.HabitItem;
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
class HabitItemRepositoryTest {

    @Autowired
    HabitItemRepository habitItemRepository;

    @Autowired
    HabitRepository habitRepository;

    @Autowired
    PlannerRepository plannerRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadHabitItem() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("habit-item-owner@example.com");
        userRepository.saveAndFlush(user);

        String habitId = UUID.randomUUID().toString();
        Habit habit = new Habit();
        habit.setId(habitId);
        habit.setUserId(userId);
        habit.setName("Meditate daily");
        habit.setSortOrder(0);
        habit.setCreatedAt("2026-11-16T08:00:00.000Z");
        habit.setUpdatedAt("2026-11-16T08:00:00.000Z");
        habitRepository.saveAndFlush(habit);

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
        HabitItem item = new HabitItem();
        item.setId(id);
        item.setHabitId(habitId);
        item.setPlannerId(plannerId);
        item.setUserId(userId);
        item.setCreatedAt("2026-11-16T08:00:00.000Z");

        habitItemRepository.saveAndFlush(item);
        entityManager.clear();

        HabitItem loaded = habitItemRepository.findById(id).orElseThrow();
        assertEquals(habitId, loaded.getHabitId());
        assertEquals(plannerId, loaded.getPlannerId());
    }
}
