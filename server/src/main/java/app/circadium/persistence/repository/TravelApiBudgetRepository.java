package app.circadium.persistence.repository;

import app.circadium.persistence.entity.TravelApiBudget;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TravelApiBudgetRepository extends JpaRepository<TravelApiBudget, String> {
}
