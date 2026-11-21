package app.circadium.auth;

import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.AuditLog;
import app.circadium.persistence.repository.AuditLogRepository;
import java.time.Clock;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuditLogger {

    private final AuditLogRepository auditLogRepository;
    private final Clock clock;

    /**
     * Runs in its own transaction: most audited events are failures, and the request that triggered them
     * usually ends by throwing, which would otherwise roll the audit row back with it.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(AuditEvent event, String userId, String email, ClientInfo client, String detail) {
        AuditLog entry = new AuditLog();
        entry.setId(UUID.randomUUID().toString());
        entry.setEvent(event.name());
        entry.setUserId(userId);
        entry.setEmail(email);
        entry.setIpAddress(client.ipAddress());
        entry.setUserAgent(client.userAgent());
        entry.setDetail(detail);
        entry.setCreatedAt(DbTime.now(clock));
        auditLogRepository.save(entry);
    }
}
