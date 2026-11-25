package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Planner;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlannerRepository extends JpaRepository<Planner, String> {

    List<Planner> findByUserIdOrderById(String userId);

    boolean existsByIdAndUserId(String id, String userId);

    Optional<Planner> findByIdAndUserId(String id, String userId);

    List<Planner> findByUserIdAndIdIn(String userId, Collection<String> ids);
}
