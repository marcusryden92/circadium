package app.circadium.persistence.repository;

import app.circadium.persistence.entity.OccurrenceCompletion;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OccurrenceCompletionRepository extends JpaRepository<OccurrenceCompletion, String> {
}
