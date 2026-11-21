package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Suggestion;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SuggestionRepository extends JpaRepository<Suggestion, String> {
}
