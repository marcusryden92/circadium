package app.circadium.persistence.repository;

import app.circadium.persistence.entity.QueueMember;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface QueueMemberRepository extends JpaRepository<QueueMember, String> {

    /** The members of the user's queues, selected through the queue as the web's {@code include} does. */
    @Query("select m from QueueMember m where m.queueId in "
            + "(select q.id from Queue q where q.userId = :userId) order by m.id")
    List<QueueMember> findByQueueOwner(@Param("userId") String userId);
}
