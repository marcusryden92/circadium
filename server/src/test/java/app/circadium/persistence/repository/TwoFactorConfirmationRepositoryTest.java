package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.TwoFactorConfirmation;
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
class TwoFactorConfirmationRepositoryTest {

    @Autowired
    TwoFactorConfirmationRepository twoFactorConfirmationRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadTwoFactorConfirmation() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("confirmation-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        TwoFactorConfirmation confirmation = new TwoFactorConfirmation();
        confirmation.setId(id);
        confirmation.setUserId(userId);

        twoFactorConfirmationRepository.saveAndFlush(confirmation);
        entityManager.clear();

        TwoFactorConfirmation loaded = twoFactorConfirmationRepository.findById(id).orElseThrow();
        assertEquals(userId, loaded.getUserId());
    }
}
