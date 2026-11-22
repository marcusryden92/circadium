package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Planner;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlannerRepository extends JpaRepository<Planner, String> {

    List<Planner> findByUserIdOrderById(String userId);
}
