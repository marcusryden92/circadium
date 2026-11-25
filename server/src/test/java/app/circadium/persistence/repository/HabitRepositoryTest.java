package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Habit;
import app.circadium.persistence.entity.HabitBucket;
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

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class HabitRepositoryTest {

    @Autowired
    HabitRepository habitRepository;

    @Autowired
    HabitBucketRepository habitBucketRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadHabit() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("habit-owner@example.com");
        userRepository.saveAndFlush(user);

        String bucketId = UUID.randomUUID().toString();
        HabitBucket bucket = new HabitBucket();
        bucket.setId(bucketId);
        bucket.setUserId(userId);
        bucket.setName("Health");
        bucket.setSortOrder(0);
        bucket.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        bucket.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        habitBucketRepository.saveAndFlush(bucket);

        String id = UUID.randomUUID().toString();
        Habit habit = new Habit();
        habit.setId(id);
        habit.setUserId(userId);
        habit.setName("Meditate daily");
        habit.setBucketId(bucketId);
        habit.setSortOrder(0);
        habit.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        habit.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));

        habitRepository.saveAndFlush(habit);
        entityManager.clear();

        Habit loaded = habitRepository.findById(id).orElseThrow();
        assertEquals("Meditate daily", loaded.getName());
        assertEquals(bucketId, loaded.getBucketId());
    }
}
