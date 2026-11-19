package app.circadium.persistence.repository;

import app.circadium.persistence.entity.TwoFactorToken;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TwoFactorTokenRepository extends JpaRepository<TwoFactorToken, String> {

    Optional<TwoFactorToken> findFirstByEmail(String email);

    boolean existsByToken(String token);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from TwoFactorToken t where t.email = :email")
    int deleteAllByEmail(@Param("email") String email);
}
