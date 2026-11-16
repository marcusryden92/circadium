package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Planner;
import app.circadium.persistence.entity.Queue;
import app.circadium.persistence.entity.QueueMember;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.PlannerType;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class QueueMemberRepositoryTest {

    @Autowired
    QueueMemberRepository queueMemberRepository;

    @Autowired
    QueueRepository queueRepository;

    @Autowired
    PlannerRepository plannerRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadQueueMember() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("queue-member-owner@example.com");
        userRepository.saveAndFlush(user);

        String queueId = UUID.randomUUID().toString();
        Queue queue = new Queue();
        queue.setId(queueId);
        queue.setTitle("Morning routine");
        queue.setUserId(userId);
        queue.setCreatedAt("2026-11-16T08:00:00.000Z");
        queue.setUpdatedAt("2026-11-16T08:00:00.000Z");
        queueRepository.saveAndFlush(queue);

        String plannerId = UUID.randomUUID().toString();
        Planner planner = new Planner();
        planner.setId(plannerId);
        planner.setTitle("Stretch");
        planner.setPlannerType(PlannerType.task);
        planner.setUserId(userId);
        planner.setCreatedAt("2026-11-16T08:00:00.000Z");
        planner.setUpdatedAt("2026-11-16T08:00:00.000Z");
        plannerRepository.saveAndFlush(planner);

        String id = UUID.randomUUID().toString();
        QueueMember member = new QueueMember();
        member.setId(id);
        member.setSortOrder(1024.0);
        member.setQueueId(queueId);
        member.setPlannerId(plannerId);
        member.setUserId(userId);
        member.setCreatedAt("2026-11-16T08:00:00.000Z");
        member.setUpdatedAt("2026-11-16T08:00:00.000Z");

        queueMemberRepository.saveAndFlush(member);
        entityManager.clear();

        QueueMember loaded = queueMemberRepository.findById(id).orElseThrow();
        assertEquals(1024.0, loaded.getSortOrder());
        assertEquals(queueId, loaded.getQueueId());
        assertEquals(plannerId, loaded.getPlannerId());
    }
}
