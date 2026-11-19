package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Session;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SessionRepository extends JpaRepository<Session, String> {
    
    Optional<Session> findByTokenHash(String tokenHash);

    void deleteAllByUserId(String userId);
}
