package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/**
 * One refresh token in a rotation chain. Every rotation inserts a new row carrying the same
 * {@code familyId} and points the old row's {@code replacedBy} at it; rotated rows are kept until they
 * expire so a replayed token can be recognised and its whole family revoked.
 *
 * <p>Hibernate writes every mapped column on insert, so the database defaults on {@code lastUsedAt}
 * and {@code createdAt} never apply; callers must set both.
 */
@Entity
@Table(name = "sessions")
@Getter
@Setter
public class Session {

    @Id
    private String id;

    private String userId;

    private String familyId;

    private String tokenHash;

    private Instant expiresAt;

    private Instant lastUsedAt;

    private String deviceName;

    private String replacedBy;

    private Instant createdAt;
}
