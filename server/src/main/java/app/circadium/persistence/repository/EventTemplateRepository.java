package app.circadium.persistence.repository;

import app.circadium.persistence.entity.EventTemplate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventTemplateRepository extends JpaRepository<EventTemplate, String> {

    List<EventTemplate> findByUserIdOrderById(String userId);
}
