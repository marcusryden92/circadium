package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.HabitBucket;
import app.circadium.persistence.entity.User;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class HabitBucketRepositoryTest {

    @Autowired
    HabitBucketRepository habitBucketRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadHabitBucket() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("bucket-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        HabitBucket bucket = new HabitBucket();
        bucket.setId(id);
        bucket.setUserId(userId);
        bucket.setName("Health");
        bucket.setColor("#22AA55");
        bucket.setSortOrder(1);
        bucket.setCreatedAt("2026-11-16T08:00:00.000Z");
        bucket.setUpdatedAt("2026-11-16T08:00:00.000Z");

        habitBucketRepository.saveAndFlush(bucket);
        entityManager.clear();

        HabitBucket loaded = habitBucketRepository.findById(id).orElseThrow();
        assertEquals("Health", loaded.getName());
        assertEquals("#22AA55", loaded.getColor());
        assertEquals(1, loaded.getSortOrder());
    }
}
