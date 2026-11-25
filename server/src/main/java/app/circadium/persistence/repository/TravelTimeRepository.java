package app.circadium.persistence.repository;

import app.circadium.persistence.entity.TravelTime;
import app.circadium.persistence.enums.TransportMode;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TravelTimeRepository extends JpaRepository<TravelTime, String> {

    List<TravelTime> findByUserIdOrderById(String userId);

    List<TravelTime> findByUserIdAndTransportMode(String userId, TransportMode transportMode);
}
