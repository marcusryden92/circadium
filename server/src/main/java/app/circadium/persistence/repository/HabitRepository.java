package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Habit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HabitRepository extends JpaRepository<Habit, String> {
}
