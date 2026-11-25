package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Suggestion;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SuggestionRepository extends JpaRepository<Suggestion, String> {

    /** The wall is global: every user's suggestions, newest first, capped by the page. */
    List<Suggestion> findAllByOrderByCreatedAtDesc(Pageable pageable);

    long countByUserId(String userId);

    int deleteByIdAndUserId(String id, String userId);
}
