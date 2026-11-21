package app.circadium.persistence.repository;

import app.circadium.persistence.entity.PasswordResetToken;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, String> {

    Optional<PasswordResetToken> findFirstByEmail(String email);

    Optional<PasswordResetToken> findByToken(String token);

    /** Returns 1 only to the caller that actually removed the row, which makes it a single-use claim. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PasswordResetToken t where t.token = :token")
    int deleteByToken(@Param("token") String token);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PasswordResetToken t where t.email = :email")
    int deleteAllByEmail(@Param("email") String email);
}
