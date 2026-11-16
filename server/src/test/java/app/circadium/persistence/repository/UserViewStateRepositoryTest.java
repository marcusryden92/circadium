package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.entity.UserViewState;
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
class UserViewStateRepositoryTest {

    @Autowired
    UserViewStateRepository userViewStateRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadUserViewState() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("view-state-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        UserViewState viewState = new UserViewState();
        viewState.setId(id);
        viewState.setUserId(userId);
        viewState.setGraph("{\"zoom\": 2}");
        viewState.setUpdatedAt(Instant.parse("2026-11-16T08:00:00Z"));

        userViewStateRepository.saveAndFlush(viewState);
        entityManager.clear();

        UserViewState loaded = userViewStateRepository.findById(id).orElseThrow();
        assertEquals("{\"zoom\": 2}", loaded.getGraph());
        assertNull(loaded.getMindmap());
        assertEquals(Instant.parse("2026-11-16T08:00:00Z"), loaded.getUpdatedAt());
    }
}
