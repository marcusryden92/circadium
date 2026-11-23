package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Queue;
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
class QueueRepositoryTest {

    @Autowired
    QueueRepository queueRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadQueue() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("queue-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        Queue queue = new Queue();
        queue.setId(id);
        queue.setTitle("Morning routine");
        queue.setSortOrder(2);
        queue.setUserId(userId);
        queue.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        queue.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));

        queueRepository.saveAndFlush(queue);
        entityManager.clear();

        Queue loaded = queueRepository.findById(id).orElseThrow();
        assertEquals("Morning routine", loaded.getTitle());
        assertEquals(2, loaded.getSortOrder());
        assertNull(loaded.getColor());
        assertNull(loaded.getCategoryId());
    }
}
