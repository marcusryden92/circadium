package app.circadium.persistence.repository;

import app.circadium.persistence.entity.EventTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventTemplateRepository extends JpaRepository<EventTemplate, String> {
}
