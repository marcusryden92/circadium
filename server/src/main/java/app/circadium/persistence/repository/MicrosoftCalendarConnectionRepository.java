package app.circadium.persistence.repository;

import app.circadium.persistence.entity.MicrosoftCalendarConnection;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MicrosoftCalendarConnectionRepository extends JpaRepository<MicrosoftCalendarConnection, String> {
}
