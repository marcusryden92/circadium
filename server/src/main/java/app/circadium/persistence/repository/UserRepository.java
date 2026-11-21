package app.circadium.persistence.repository;

import app.circadium.persistence.entity.User;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * The web app writes {@code users} too (the sync bumps {@code dataVersion} on every save), and saving a
 * {@link User} entity rewrites every column. Flows that change a few columns of an existing user therefore use
 * the targeted updates below, so they cannot put back a value the web changed in the meantime.
 */
public interface UserRepository extends JpaRepository<User, String> {

    /**
     * Case-insensitive because NextAuth-era rows stored the address exactly as typed, while new
     * registrations store it lowercased.
     */
    Optional<User> findFirstByEmailIgnoreCase(String email);

    /**
     * The owner of a refresh token, share-locked until the transaction ends. Holding it makes a refresh and a
     * password change or reset (which update the user row) run one after the other.
     */
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select u from User u where u.id = (select s.userId from Session s where s.tokenHash = :tokenHash)")
    Optional<User> findByRefreshTokenHashForShare(@Param("tokenHash") String tokenHash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update User u set u.password = :hash, u.passwordChangedAt = :changedAt where u.id = :id")
    int updatePassword(@Param("id") String id, @Param("hash") String hash, @Param("changedAt") Instant changedAt);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update User u set u.email = :email, u.emailVerified = :verifiedAt where u.id = :id")
    int updateVerifiedEmail(@Param("id") String id, @Param("email") String email,
            @Param("verifiedAt") Instant verifiedAt);
}
