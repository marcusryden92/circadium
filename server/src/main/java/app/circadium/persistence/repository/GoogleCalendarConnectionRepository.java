package app.circadium.persistence.repository;

import app.circadium.persistence.entity.GoogleCalendarConnection;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GoogleCalendarConnectionRepository extends JpaRepository<GoogleCalendarConnection, String> {
}
