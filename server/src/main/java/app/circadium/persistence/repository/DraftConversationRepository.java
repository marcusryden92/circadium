package app.circadium.persistence.repository;

import app.circadium.persistence.entity.DraftConversation;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DraftConversationRepository extends JpaRepository<DraftConversation, String> {

    List<DraftConversation> findByUserIdOrderByUpdatedAtDesc(String userId, Pageable pageable);

    Optional<DraftConversation> findByIdAndUserId(String id, String userId);

    long deleteByIdAndUserId(String id, String userId);
}
