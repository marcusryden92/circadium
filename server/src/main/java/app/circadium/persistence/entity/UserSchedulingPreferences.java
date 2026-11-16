package app.circadium.persistence.entity;

import app.circadium.persistence.enums.TransportMode;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "UserSchedulingPreferences")
@Getter
@Setter
public class UserSchedulingPreferences {

    @Id
    private String id;

    private String userId;

    private int bufferTimeMinutes;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private TransportMode defaultTransportMode;

    private int weekStartDay;

    private Instant lastTravelRefreshAt;

    private Instant lastTravelTopUpAt;

    private Instant createdAt;

    private Instant updatedAt;

}
