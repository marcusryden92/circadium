package app.circadium.persistence.repository;

import app.circadium.persistence.entity.TwoFactorConfirmation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TwoFactorConfirmationRepository extends JpaRepository<TwoFactorConfirmation, String> {
}
