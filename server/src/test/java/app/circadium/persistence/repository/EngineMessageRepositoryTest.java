package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.EngineMessage;
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
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class EngineMessageRepositoryTest {

    @Autowired
    EngineMessageRepository engineMessageRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadEngineMessage() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("engine-message-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        EngineMessage message = new EngineMessage();
        message.setId(id);
        message.setType("TASK_UNSCHEDULABLE");
        message.setTone("fail");
        message.setPayload("{\"reason\": \"NO_SLOTS\"}");
        message.setDismissed(true);
        message.setUserId(userId);
        message.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        message.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));

        engineMessageRepository.saveAndFlush(message);
        entityManager.clear();

        EngineMessage loaded = engineMessageRepository.findById(id).orElseThrow();
        assertEquals("TASK_UNSCHEDULABLE", loaded.getType());
        assertEquals("fail", loaded.getTone());
        assertEquals("{\"reason\": \"NO_SLOTS\"}", loaded.getPayload());
        assertTrue(loaded.isDismissed());
    }
}
