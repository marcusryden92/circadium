package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Category;
import app.circadium.persistence.entity.CategoryEvent;
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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class CategoryEventRepositoryTest {

    @Autowired
    CategoryEventRepository categoryEventRepository;

    @Autowired
    CategoryTimeWindowRepository categoryTimeWindowRepository;

    @Autowired
    CategoryRepository categoryRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadCategoryEvent() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("category-event-owner@example.com");
        userRepository.saveAndFlush(user);

        String categoryId = UUID.randomUUID().toString();
        Category category = new Category();
        category.setId(categoryId);
        category.setName("Professional");
        category.setUserId(userId);
        category.setCreatedAt("2026-11-16T08:00:00.000Z");
        category.setUpdatedAt("2026-11-16T08:00:00.000Z");
        categoryRepository.saveAndFlush(category);

        String windowId = UUID.randomUUID().toString();
        CategoryTimeWindow window = new CategoryTimeWindow();
        window.setId(windowId);
        window.setDay(3);
        window.setStartTime("09:00");
        window.setEndTime("17:00");
        window.setCategoryId(categoryId);
        window.setUserId(userId);
        categoryTimeWindowRepository.saveAndFlush(window);

        String id = windowId + "|2026-11-18";
        CategoryEvent event = new CategoryEvent();
        event.setId(id);
        event.setStart("2026-11-18T09:00:00.000Z");
        event.setEnd("2026-11-18T17:00:00.000Z");
        event.setTrespassingStart(true);
        event.setTrespassingEnd(false);
        event.setCategoryTimeWindowId(windowId);
        event.setCategoryId(categoryId);
        event.setUserId(userId);
        event.setCreatedAt("2026-11-16T08:00:00.000Z");
        event.setUpdatedAt("2026-11-16T08:00:00.000Z");

        categoryEventRepository.saveAndFlush(event);
        entityManager.clear();

        CategoryEvent loaded = categoryEventRepository.findById(id).orElseThrow();
        assertEquals("2026-11-18T09:00:00.000Z", loaded.getStart());
        assertEquals("2026-11-18T17:00:00.000Z", loaded.getEnd());
        assertTrue(loaded.isTrespassingStart());
        assertFalse(loaded.isTrespassingEnd());
        assertEquals(windowId, loaded.getCategoryTimeWindowId());
        assertEquals(categoryId, loaded.getCategoryId());
    }
}
