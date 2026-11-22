package app.circadium.persistence.repository;

import app.circadium.persistence.entity.SimpleEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SimpleEventRepository extends JpaRepository<SimpleEvent, String> {

    List<SimpleEvent> findByUserIdOrderById(String userId);
}
