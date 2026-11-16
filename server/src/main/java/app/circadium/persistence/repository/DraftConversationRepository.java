package app.circadium.persistence.repository;

import app.circadium.persistence.entity.DraftConversation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DraftConversationRepository extends JpaRepository<DraftConversation, String> {
}
