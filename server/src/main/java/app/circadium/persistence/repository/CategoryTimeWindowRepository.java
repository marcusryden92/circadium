package app.circadium.persistence.repository;

import app.circadium.persistence.entity.CategoryTimeWindow;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryTimeWindowRepository extends JpaRepository<CategoryTimeWindow, String> {
}
