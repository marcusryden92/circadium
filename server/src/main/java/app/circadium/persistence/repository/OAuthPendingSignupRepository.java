package app.circadium.persistence.repository;

import app.circadium.persistence.entity.OAuthPendingSignup;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OAuthPendingSignupRepository extends JpaRepository<OAuthPendingSignup, String> {

    Optional<OAuthPendingSignup> findByProviderAndSubject(String provider, String subject);

    /** Returns 1 for exactly one caller even when the same link is opened twice at once. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OAuthPendingSignup p where p.tokenHash = :tokenHash")
    int deleteByTokenHash(@Param("tokenHash") String tokenHash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OAuthPendingSignup p where p.provider = :provider and p.subject = :subject")
    int deleteByProviderAndSubject(@Param("provider") String provider, @Param("subject") String subject);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OAuthPendingSignup p where p.expiresAt < :cutoff")
    int deleteAllExpiredBefore(@Param("cutoff") Instant cutoff);
}
