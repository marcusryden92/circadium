package app.circadium.persistence.repository;

import app.circadium.persistence.entity.UserViewState;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserViewStateRepository extends JpaRepository<UserViewState, String> {
}
