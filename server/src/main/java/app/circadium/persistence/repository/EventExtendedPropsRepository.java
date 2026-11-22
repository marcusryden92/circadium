package app.circadium.persistence.repository;

import app.circadium.persistence.entity.EventExtendedProps;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EventExtendedPropsRepository extends JpaRepository<EventExtendedProps, String> {

    /** The props of the user's events. The table has no user column of its own; ownership is the event's. */
    @Query("select p from EventExtendedProps p where p.eventId in "
            + "(select e.id from SimpleEvent e where e.userId = :userId) order by p.id")
    List<EventExtendedProps> findByEventOwner(@Param("userId") String userId);
}
