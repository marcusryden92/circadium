package app.circadium.persistence.repository;

import app.circadium.persistence.entity.GoogleCalendarConnection;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GoogleCalendarConnectionRepository extends JpaRepository<GoogleCalendarConnection, String> {

    Optional<GoogleCalendarConnection> findByUserId(String userId);

    void deleteByUserId(String userId);
}
