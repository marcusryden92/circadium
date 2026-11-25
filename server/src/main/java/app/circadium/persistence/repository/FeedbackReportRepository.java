package app.circadium.persistence.repository;

import app.circadium.persistence.entity.FeedbackReport;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FeedbackReportRepository extends JpaRepository<FeedbackReport, String> {

    /** The blob alone, so the admin list and the snapshot read never drag each other's columns. */
    @Query("select f.dataSnapshot from FeedbackReport f where f.id = :id")
    Optional<String> findSnapshotById(@Param("id") String id);

    /** GDPR hygiene: drops just the snapshot once a report is resolved, keeping the message. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update FeedbackReport f set f.dataSnapshot = null where f.id = :id")
    int clearSnapshot(@Param("id") String id);
}
