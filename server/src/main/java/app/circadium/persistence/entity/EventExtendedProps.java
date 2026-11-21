package app.circadium.persistence.entity;

import app.circadium.persistence.enums.EventType;
import app.circadium.persistence.enums.PlannerType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "EventExtendedProps")
@Getter
@Setter
public class EventExtendedProps {

    @Id
    private String id;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private PlannerType plannerType;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private EventType eventType;

    private String completedStartTime;

    private String completedEndTime;

    private String parentId;

    private boolean trespassingStart;

    private boolean trespassingEnd;

    private String eventId;

}
