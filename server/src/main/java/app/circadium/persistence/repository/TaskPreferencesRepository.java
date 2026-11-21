package app.circadium.persistence.repository;

import app.circadium.persistence.entity.TaskPreferences;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskPreferencesRepository extends JpaRepository<TaskPreferences, String> {
}
