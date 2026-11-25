package app.circadium.persistence.repository;

import app.circadium.persistence.entity.ExternalCalendarSource;
import app.circadium.persistence.enums.ExternalCalendarKind;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExternalCalendarSourceRepository extends JpaRepository<ExternalCalendarSource, String> {

    List<ExternalCalendarSource> findByUserId(String userId);

    Optional<ExternalCalendarSource> findByIdAndUserId(String id, String userId);

    Optional<ExternalCalendarSource> findFirstByUserIdAndKindAndUrl(String userId, ExternalCalendarKind kind,
            String url);

    List<ExternalCalendarSource> findByUserIdAndKind(String userId, ExternalCalendarKind kind);

    long deleteByIdAndUserId(String id, String userId);

    void deleteByUserIdAndKind(String userId, ExternalCalendarKind kind);
}
