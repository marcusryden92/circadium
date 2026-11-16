package app.circadium.persistence.repository;

import app.circadium.persistence.entity.AccountDeletionToken;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountDeletionTokenRepository extends JpaRepository<AccountDeletionToken, String> {
}
