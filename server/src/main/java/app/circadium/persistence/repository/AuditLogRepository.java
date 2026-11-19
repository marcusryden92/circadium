package app.circadium.persistence.repository;

import app.circadium.persistence.entity.AuditLog;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLog, String> {

    List<AuditLog> findAllByEmailOrderByCreatedAtAsc(String email);

    List<AuditLog> findAllByUserIdOrderByCreatedAtAsc(String userId);
}
