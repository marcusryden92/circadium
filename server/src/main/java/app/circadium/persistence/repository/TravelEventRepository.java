package app.circadium.persistence.repository;

import app.circadium.persistence.entity.TravelEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TravelEventRepository extends JpaRepository<TravelEvent, String> {

    List<TravelEvent> findByUserIdOrderById(String userId);
}
