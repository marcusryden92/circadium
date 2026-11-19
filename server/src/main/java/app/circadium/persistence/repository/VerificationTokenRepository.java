package app.circadium.persistence.repository;

import app.circadium.persistence.entity.VerificationToken;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VerificationTokenRepository extends JpaRepository<VerificationToken, String> {

    Optional<VerificationToken> findFirstByEmail(String email);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from VerificationToken t where t.email = :email")
    int deleteAllByEmail(@Param("email") String email);
}
