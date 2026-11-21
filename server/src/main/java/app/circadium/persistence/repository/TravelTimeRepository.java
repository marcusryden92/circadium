package app.circadium.persistence.repository;

import app.circadium.persistence.entity.TravelTime;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TravelTimeRepository extends JpaRepository<TravelTime, String> {
}
