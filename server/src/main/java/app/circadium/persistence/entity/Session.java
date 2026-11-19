package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "sessions")
@Getter
@Setter
public class Session {

    @Id
    private String id;

    private String userId;

    private String tokenHash;

    private Instant expiresAt;

    private Instant lastUsedAt;

    private String deviceName;

    private String replacedBy;

    private Instant createdAt;
    
}