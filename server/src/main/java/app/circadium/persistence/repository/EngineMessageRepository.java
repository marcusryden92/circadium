package app.circadium.persistence.repository;

import app.circadium.persistence.entity.EngineMessage;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EngineMessageRepository extends JpaRepository<EngineMessage, String> {

    List<EngineMessage> findByUserIdOrderById(String userId);
}
