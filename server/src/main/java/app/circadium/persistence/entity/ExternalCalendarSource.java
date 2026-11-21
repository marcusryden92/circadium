package app.circadium.persistence.entity;

import app.circadium.persistence.enums.ExternalCalendarKind;
import app.circadium.persistence.enums.ExternalCalendarMode;
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
@Table(name = "ExternalCalendarSources")
@Getter
@Setter
public class ExternalCalendarSource {

    @Id
    private String id;

    private String userId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private ExternalCalendarKind kind;

    private String url;

    private String name;

    private String color;

    private boolean enabled;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private ExternalCalendarMode mode;

    private String modeExceptions;

    private String locationId;

    private String locationExceptions;

    private Instant lastFetchedAt;

    private String lastError;

    private Instant createdAt;

    private Instant updatedAt;

}
