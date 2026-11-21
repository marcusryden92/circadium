package app.circadium.persistence.repository;

import app.circadium.persistence.entity.VerificationToken;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VerificationTokenRepository extends JpaRepository<VerificationToken, String> {

    Optional<VerificationToken> findFirstByEmail(String email);

    Optional<VerificationToken> findByToken(String token);

    /** Returns 1 only to the caller that actually removed the row, which makes it a single-use claim. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from VerificationToken t where t.token = :token")
    int deleteByToken(@Param("token") String token);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from VerificationToken t where t.email = :email")
    int deleteAllByEmail(@Param("email") String email);

    /** Only email-change tokens carry a user id, so this cancels the user's pending email change. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from VerificationToken t where t.userId = :userId")
    int deleteAllByUserId(@Param("userId") String userId);
}
