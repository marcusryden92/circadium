package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Category;
import app.circadium.persistence.entity.CategoryTimeWindow;
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

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class CategoryTimeWindowRepositoryTest {

    @Autowired
    CategoryTimeWindowRepository categoryTimeWindowRepository;

    @Autowired
    CategoryRepository categoryRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadCategoryTimeWindow() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("window-owner@example.com");
        userRepository.saveAndFlush(user);

        String categoryId = UUID.randomUUID().toString();
        Category category = new Category();
        category.setId(categoryId);
        category.setName("Professional");
        category.setUserId(userId);
        category.setCreatedAt("2026-11-16T08:00:00.000Z");
        category.setUpdatedAt("2026-11-16T08:00:00.000Z");
        categoryRepository.saveAndFlush(category);

        String id = UUID.randomUUID().toString();
        CategoryTimeWindow window = new CategoryTimeWindow();
        window.setId(id);
        window.setDay(3);
        window.setStartTime("09:00");
        window.setEndTime("17:00");
        window.setCategoryId(categoryId);
        window.setUserId(userId);

        categoryTimeWindowRepository.saveAndFlush(window);
        entityManager.clear();

        CategoryTimeWindow loaded = categoryTimeWindowRepository.findById(id).orElseThrow();
        assertEquals(3, loaded.getDay());
        assertEquals("09:00", loaded.getStartTime());
        assertEquals("17:00", loaded.getEndTime());
        assertEquals(categoryId, loaded.getCategoryId());
        assertNull(loaded.getRecurrenceExceptions());
    }
}
