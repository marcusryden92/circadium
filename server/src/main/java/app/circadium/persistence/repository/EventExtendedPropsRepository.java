package app.circadium.persistence.repository;

import app.circadium.persistence.entity.EventExtendedProps;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventExtendedPropsRepository extends JpaRepository<EventExtendedProps, String> {
}
