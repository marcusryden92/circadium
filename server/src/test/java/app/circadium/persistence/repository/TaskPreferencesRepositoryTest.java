package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Planner;
import app.circadium.persistence.entity.TaskPreferences;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.EnergyLevel;
import app.circadium.persistence.enums.PlannerType;
import app.circadium.persistence.enums.PriorityLevel;
import app.circadium.persistence.enums.TaskTypeEnum;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class TaskPreferencesRepositoryTest {

    @Autowired
    TaskPreferencesRepository taskPreferencesRepository;

    @Autowired
    PlannerRepository plannerRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadTaskPreferences() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("task-prefs-owner@example.com");
        userRepository.saveAndFlush(user);

        String plannerId = UUID.randomUUID().toString();
        Planner planner = new Planner();
        planner.setId(plannerId);
        planner.setTitle("Deep work");
        planner.setPlannerType(PlannerType.task);
        planner.setUserId(userId);
        planner.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        planner.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        plannerRepository.saveAndFlush(planner);

        String id = UUID.randomUUID().toString();
        TaskPreferences prefs = new TaskPreferences();
        prefs.setId(id);
        prefs.setPlannerId(plannerId);
        prefs.setTaskType(TaskTypeEnum.DEEP_WORK);
        prefs.setPreferredDays(List.of(1, 3, 5));
        prefs.setPreferredStartTime("09:00");
        prefs.setPreferredEndTime("12:00");
        prefs.setPriority(PriorityLevel.HIGH);
        prefs.setEnergyLevel(EnergyLevel.HIGH);
        prefs.setAllowFlexibility(true);

        taskPreferencesRepository.saveAndFlush(prefs);
        entityManager.clear();

        TaskPreferences loaded = taskPreferencesRepository.findById(id).orElseThrow();
        assertEquals(TaskTypeEnum.DEEP_WORK, loaded.getTaskType());
        assertEquals(List.of(1, 3, 5), loaded.getPreferredDays());
        assertNull(loaded.getAvoidDays());
        assertEquals(PriorityLevel.HIGH, loaded.getPriority());
        assertEquals(EnergyLevel.HIGH, loaded.getEnergyLevel());
        assertTrue(loaded.isAllowFlexibility());
    }
}
