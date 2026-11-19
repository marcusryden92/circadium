package app.circadium.persistence.repository;

import app.circadium.persistence.entity.Session;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SessionRepository extends JpaRepository<Session, String> {

    Optional<Session> findByTokenHash(String tokenHash);

    /**
     * Row-locks the session so two concurrent refreshes of the same token serialize: the second one
     * sees {@code replacedBy} already set and is treated as reuse instead of minting a parallel chain.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Session s where s.tokenHash = :tokenHash")
    Optional<Session> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    long countByFamilyId(String familyId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from Session s where s.familyId = :familyId")
    int deleteAllByFamilyId(@Param("familyId") String familyId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from Session s where s.userId = :userId")
    int deleteAllByUserId(@Param("userId") String userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from Session s where s.expiresAt < :cutoff")
    int deleteAllExpiredBefore(@Param("cutoff") Instant cutoff);
}
