package app.circadium.persistence.repository;

import app.circadium.persistence.entity.OAuthHandoffCode;
import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OAuthHandoffCodeRepository extends JpaRepository<OAuthHandoffCode, String> {

    /** Returns 1 for exactly one caller even when the same code is redeemed concurrently. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OAuthHandoffCode c where c.codeHash = :codeHash")
    int deleteByCodeHash(@Param("codeHash") String codeHash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OAuthHandoffCode c where c.expiresAt < :cutoff")
    int deleteAllExpiredBefore(@Param("cutoff") Instant cutoff);
}
