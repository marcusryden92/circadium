package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Habit;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HabitRepository extends JpaRepository<Habit, String> {

    List<Habit> findByUserIdOrderBySortOrderAscCreatedAtAsc(String userId);

    Optional<Habit> findByIdAndUserId(String id, String userId);

    List<Habit> findByUserIdAndIdIn(String userId, Collection<String> ids);

    void deleteByIdAndUserId(String id, String userId);
}
