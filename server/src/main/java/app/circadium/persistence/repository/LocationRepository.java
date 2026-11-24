package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Location;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocationRepository extends JpaRepository<Location, String> {

    /** Oldest first: the order the Locations page lists them in. */
    List<Location> findByUserIdOrderByCreatedAtAscIdAsc(String userId);

    long countByUserId(String userId);

    Optional<Location> findByIdAndUserId(String id, String userId);

    Optional<Location> findByUserIdAndPlaceId(String userId, String placeId);
}
