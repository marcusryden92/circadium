package app.circadium.persistence.repository;

import app.circadium.persistence.entity.SuggestionVote;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SuggestionVoteRepository extends JpaRepository<SuggestionVote, String> {

    List<SuggestionVote> findBySuggestionIdIn(Collection<String> suggestionIds);

    Optional<SuggestionVote> findBySuggestionIdAndUserId(String suggestionId, String userId);

    int deleteBySuggestionIdAndUserId(String suggestionId, String userId);
}
