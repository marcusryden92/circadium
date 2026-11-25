package app.circadium.persistence.repository;

import app.circadium.persistence.entity.HabitBucket;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HabitBucketRepository extends JpaRepository<HabitBucket, String> {

    List<HabitBucket> findByUserIdOrderBySortOrderAscCreatedAtAsc(String userId);

    Optional<HabitBucket> findByIdAndUserId(String id, String userId);

    Optional<HabitBucket> findFirstByUserIdOrderBySortOrderDesc(String userId);

    void deleteByIdAndUserId(String id, String userId);
}
