package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.FeedbackReport;
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
class FeedbackReportRepositoryTest {

    @Autowired
    FeedbackReportRepository feedbackReportRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadFeedbackReport() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("feedback-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        FeedbackReport report = new FeedbackReport();
        report.setId(id);
        report.setMessage("The calendar is great");
        report.setDataSnapshot("{\"exported\": true}");
        report.setUserId(userId);
        report.setCreatedAt("2026-11-16T08:00:00.000Z");

        feedbackReportRepository.saveAndFlush(report);
        entityManager.clear();

        FeedbackReport loaded = feedbackReportRepository.findById(id).orElseThrow();
        assertEquals("The calendar is great", loaded.getMessage());
        assertEquals("{\"exported\": true}", loaded.getDataSnapshot());
    }
}
