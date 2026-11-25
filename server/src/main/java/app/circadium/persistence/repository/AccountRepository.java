package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Account;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface AccountRepository extends JpaRepository<Account, String> {

    /** {@code (provider, providerAccountId)} is unique, so at most one row matches. */
    Optional<Account> findByProviderAndProviderAccountId(String provider, String providerAccountId);

    List<Account> findAllByUserIdAndProvider(String userId, String provider);

    List<Account> findAllByUserId(String userId);

    /** A targeted update, so a sign-in never rewrites the rest of a row it loaded earlier. */
    @Transactional
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Account a set a.refreshToken = :refreshToken where a.id = :id")
    int updateRefreshToken(@Param("id") String id, @Param("refreshToken") String refreshToken);
}
