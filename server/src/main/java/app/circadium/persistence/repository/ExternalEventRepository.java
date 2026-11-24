package app.circadium.persistence.repository;

import app.circadium.persistence.entity.ExternalEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExternalEventRepository extends JpaRepository<ExternalEvent, String> {

    List<ExternalEvent> findByUserId(String userId);
}
