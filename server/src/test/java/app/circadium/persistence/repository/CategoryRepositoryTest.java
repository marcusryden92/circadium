package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Category;
import app.circadium.persistence.entity.User;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class CategoryRepositoryTest {

    @Autowired
    CategoryRepository categoryRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadCategory() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("category-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        Category category = new Category();
        category.setId(id);
        category.setName("Professional");
        category.setIcon("work-icon");
        category.setColor("#44AA88");
        category.setSortOrder(3);
        category.setUseTimeWindows(true);
        category.setStrict(true);
        category.setConfineToOwnWindows(true);
        category.setUserId(userId);
        category.setCreatedAt("2026-11-16T08:00:00.000Z");
        category.setUpdatedAt("2026-11-16T08:00:00.000Z");

        categoryRepository.saveAndFlush(category);
        entityManager.clear();

        Category loaded = categoryRepository.findById(id).orElseThrow();
        assertEquals("Professional", loaded.getName());
        assertEquals("work-icon", loaded.getIcon());
        assertEquals("#44AA88", loaded.getColor());
        assertEquals(3, loaded.getSortOrder());
        assertTrue(loaded.isUseTimeWindows());
        assertTrue(loaded.isStrict());
        assertTrue(loaded.isConfineToOwnWindows());
        assertNull(loaded.getParentId());
        assertNull(loaded.getLocationId());
    }
}
