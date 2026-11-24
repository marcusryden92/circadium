package app.circadium.persistence.repository;

import app.circadium.persistence.entity.UserSchedulingPreferences;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserSchedulingPreferencesRepository extends JpaRepository<UserSchedulingPreferences, String> {

    Optional<UserSchedulingPreferences> findByUserId(String userId);
}
