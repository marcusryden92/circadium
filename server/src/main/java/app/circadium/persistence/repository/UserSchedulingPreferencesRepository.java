package app.circadium.persistence.repository;

import app.circadium.persistence.entity.UserSchedulingPreferences;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserSchedulingPreferencesRepository extends JpaRepository<UserSchedulingPreferences, String> {
}
