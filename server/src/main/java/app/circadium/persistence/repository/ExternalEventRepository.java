package app.circadium.persistence.repository;

import app.circadium.persistence.entity.ExternalEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExternalEventRepository extends JpaRepository<ExternalEvent, String> {
}
