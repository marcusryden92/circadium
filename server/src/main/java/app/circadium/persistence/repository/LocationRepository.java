package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Location;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocationRepository extends JpaRepository<Location, String> {

    /** Oldest first: the order the Locations page lists them in. */
    List<Location> findByUserIdOrderByCreatedAtAscIdAsc(String userId);
}
