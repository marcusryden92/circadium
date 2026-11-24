package app.circadium.persistence.repository;

import app.circadium.persistence.entity.UserViewState;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserViewStateRepository extends JpaRepository<UserViewState, String> {

    Optional<UserViewState> findByUserId(String userId);
}
