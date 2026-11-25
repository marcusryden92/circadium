package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Suggestion;
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
class SuggestionRepositoryTest {

    @Autowired
    SuggestionRepository suggestionRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadSuggestion() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("suggestion-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        Suggestion suggestion = new Suggestion();
        suggestion.setId(id);
        suggestion.setTitle("Add dark mode to the mobile app");
        suggestion.setBody("It would reduce eye strain at night.");
        suggestion.setUserId(userId);
        suggestion.setCreatedAt(java.time.Instant.parse("2026-11-16T08:00:00.000Z"));

        suggestionRepository.saveAndFlush(suggestion);
        entityManager.clear();

        Suggestion loaded = suggestionRepository.findById(id).orElseThrow();
        assertEquals("Add dark mode to the mobile app", loaded.getTitle());
        assertEquals("It would reduce eye strain at night.", loaded.getBody());
    }
}
