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
@Table(name = "TravelTimes")
@Getter
@Setter
public class TravelTime {

    @Id
    private String id;

    private String fromLocationId;

    private String toLocationId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private TransportMode transportMode;

    private int googleRushHourMinutes;

    private int googleRegularMinutes;

    private int googleNightMinutes;

    private Integer customRushHourMinutes;

    private Integer customRegularMinutes;

    private Integer customNightMinutes;

    private Instant unroutableAt;

    private String userId;

    private Instant createdAt;

    private Instant updatedAt;

}
