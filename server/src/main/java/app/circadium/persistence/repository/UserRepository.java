package app.circadium.persistence.repository;

import app.circadium.persistence.entity.User;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, String> {

    /**
     * Case-insensitive because NextAuth-era rows stored the address exactly as typed, while new
     * registrations store it lowercased.
     */
    Optional<User> findFirstByEmailIgnoreCase(String email);
}
