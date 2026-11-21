package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/**
 * One security-relevant auth event. {@code email} records the identifier that was presented, so failed
 * attempts against accounts that do not exist are still traceable; {@code userId} is set only when the
 * account is known.
 */
@Entity
@Table(name = "audit_log")
@Getter
@Setter
public class AuditLog {

    @Id
    private String id;

    private String userId;

    private String event;

    private String email;

    private String ipAddress;

    private String userAgent;

    private String detail;

    private Instant createdAt;
}
