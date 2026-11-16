package app.circadium.persistence.repository;

import app.circadium.persistence.entity.SuggestionVote;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SuggestionVoteRepository extends JpaRepository<SuggestionVote, String> {
}
