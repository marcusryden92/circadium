package app.circadium.persistence.repository;

import app.circadium.persistence.entity.FeedbackReport;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeedbackReportRepository extends JpaRepository<FeedbackReport, String> {
}
