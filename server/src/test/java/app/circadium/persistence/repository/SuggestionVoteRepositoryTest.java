package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Suggestion;
import app.circadium.persistence.entity.SuggestionVote;
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
class SuggestionVoteRepositoryTest {

    @Autowired
    SuggestionVoteRepository suggestionVoteRepository;

    @Autowired
    SuggestionRepository suggestionRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadSuggestionVote() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("vote-owner@example.com");
        userRepository.saveAndFlush(user);

        String suggestionId = UUID.randomUUID().toString();
        Suggestion suggestion = new Suggestion();
        suggestion.setId(suggestionId);
        suggestion.setTitle("Add dark mode");
        suggestion.setUserId(userId);
        suggestion.setCreatedAt(java.time.Instant.parse("2026-11-16T08:00:00.000Z"));
        suggestionRepository.saveAndFlush(suggestion);

        String id = UUID.randomUUID().toString();
        SuggestionVote vote = new SuggestionVote();
        vote.setId(id);
        vote.setValue(1);
        vote.setSuggestionId(suggestionId);
        vote.setUserId(userId);
        vote.setCreatedAt(java.time.Instant.parse("2026-11-16T08:00:00.000Z"));

        suggestionVoteRepository.saveAndFlush(vote);
        entityManager.clear();

        SuggestionVote loaded = suggestionVoteRepository.findById(id).orElseThrow();
        assertEquals(1, loaded.getValue());
        assertEquals(suggestionId, loaded.getSuggestionId());
    }
}
