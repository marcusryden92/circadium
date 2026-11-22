package app.circadium.persistence.repository;

import app.circadium.persistence.entity.CategoryEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryEventRepository extends JpaRepository<CategoryEvent, String> {

    List<CategoryEvent> findByUserIdOrderById(String userId);
}
