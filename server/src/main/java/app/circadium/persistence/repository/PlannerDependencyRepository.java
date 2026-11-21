package app.circadium.persistence.repository;

import app.circadium.persistence.entity.PlannerDependency;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlannerDependencyRepository extends JpaRepository<PlannerDependency, String> {
}
