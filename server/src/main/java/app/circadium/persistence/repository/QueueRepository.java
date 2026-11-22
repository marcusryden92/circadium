package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Queue;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QueueRepository extends JpaRepository<Queue, String> {

    List<Queue> findByUserIdOrderById(String userId);
}
