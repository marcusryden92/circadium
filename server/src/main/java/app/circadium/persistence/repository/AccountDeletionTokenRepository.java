package app.circadium.persistence.repository;

import app.circadium.persistence.entity.AccountDeletionToken;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccountDeletionTokenRepository extends JpaRepository<AccountDeletionToken, String> {

    Optional<AccountDeletionToken> findByToken(String token);

    /** Returns 1 only to the caller that actually removed the row, which makes it a single-use claim. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from AccountDeletionToken t where t.token = :token")
    int deleteByToken(@Param("token") String token);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from AccountDeletionToken t where t.userId = :userId")
    int deleteAllByUserId(@Param("userId") String userId);
}
