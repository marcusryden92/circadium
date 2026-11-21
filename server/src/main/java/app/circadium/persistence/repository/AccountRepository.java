package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Account;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<Account, String> {

    /** {@code (provider, providerAccountId)} is unique, so at most one row matches. */
    Optional<Account> findByProviderAndProviderAccountId(String provider, String providerAccountId);
}
