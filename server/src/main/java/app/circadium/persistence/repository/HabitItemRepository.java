package app.circadium.persistence.repository;

import app.circadium.persistence.entity.HabitItem;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HabitItemRepository extends JpaRepository<HabitItem, String> {

    List<HabitItem> findByUserId(String userId);

    Optional<HabitItem> findByHabitIdAndPlannerId(String habitId, String plannerId);

    void deleteByUserIdAndHabitIdAndPlannerId(String userId, String habitId, String plannerId);
}
