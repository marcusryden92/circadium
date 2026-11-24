package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.DraftConversation;
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
class DraftConversationRepositoryTest {

    @Autowired
    DraftConversationRepository draftConversationRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadDraftConversation() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("draft-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        DraftConversation conversation = new DraftConversation();
        conversation.setId(id);
        conversation.setTitle("Plan my week");
        conversation.setMessages("[]");
        conversation.setUserId(userId);
        conversation.setCreatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));
        conversation.setUpdatedAt(Instant.parse("2026-11-16T08:00:00.000Z"));

        draftConversationRepository.saveAndFlush(conversation);
        entityManager.clear();

        DraftConversation loaded = draftConversationRepository.findById(id).orElseThrow();
        assertEquals("Plan my week", loaded.getTitle());
        assertEquals("[]", loaded.getMessages());
    }
}
