package app.circadium.persistence.repository;

import app.circadium.persistence.entity.TwoFactorToken;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TwoFactorTokenRepository extends JpaRepository<TwoFactorToken, String> {
}
