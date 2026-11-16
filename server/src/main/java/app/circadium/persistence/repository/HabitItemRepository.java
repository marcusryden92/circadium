package app.circadium.persistence.repository;

import app.circadium.persistence.entity.HabitItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HabitItemRepository extends JpaRepository<HabitItem, String> {
}
