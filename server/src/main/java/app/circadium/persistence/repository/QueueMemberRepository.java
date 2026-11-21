package app.circadium.persistence.repository;

import app.circadium.persistence.entity.QueueMember;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QueueMemberRepository extends JpaRepository<QueueMember, String> {
}
