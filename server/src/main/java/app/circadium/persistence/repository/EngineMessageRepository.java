package app.circadium.persistence.repository;

import app.circadium.persistence.entity.EngineMessage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EngineMessageRepository extends JpaRepository<EngineMessage, String> {
}
