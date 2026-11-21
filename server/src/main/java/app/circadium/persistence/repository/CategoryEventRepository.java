package app.circadium.persistence.repository;

import app.circadium.persistence.entity.CategoryEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryEventRepository extends JpaRepository<CategoryEvent, String> {
}
