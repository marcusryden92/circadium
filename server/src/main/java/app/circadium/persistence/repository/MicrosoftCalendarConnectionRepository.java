package app.circadium.persistence.repository;

import app.circadium.persistence.entity.MicrosoftCalendarConnection;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MicrosoftCalendarConnectionRepository extends JpaRepository<MicrosoftCalendarConnection, String> {

    Optional<MicrosoftCalendarConnection> findByUserId(String userId);

    void deleteByUserId(String userId);
}
