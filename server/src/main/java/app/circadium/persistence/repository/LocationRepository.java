package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Location;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocationRepository extends JpaRepository<Location, String> {
}
