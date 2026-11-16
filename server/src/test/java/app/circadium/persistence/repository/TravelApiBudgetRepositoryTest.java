package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.TravelApiBudget;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class TravelApiBudgetRepositoryTest {

    @Autowired
    TravelApiBudgetRepository travelApiBudgetRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadTravelApiBudget() {
        TravelApiBudget budget = new TravelApiBudget();
        budget.setId("global");
        budget.setElementsThisMonth(1200);
        budget.setPeriodStart(Instant.parse("2026-11-01T00:00:00Z"));
        budget.setUpdatedAt(Instant.parse("2026-11-16T08:00:00Z"));

        travelApiBudgetRepository.saveAndFlush(budget);
        entityManager.clear();

        TravelApiBudget loaded = travelApiBudgetRepository.findById("global").orElseThrow();
        assertEquals(1200, loaded.getElementsThisMonth());
        assertEquals(Instant.parse("2026-11-01T00:00:00Z"), loaded.getPeriodStart());
    }
}
