package app.circadium.persistence.repository;

import app.circadium.persistence.entity.SimpleEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SimpleEventRepository extends JpaRepository<SimpleEvent, String> {
}
