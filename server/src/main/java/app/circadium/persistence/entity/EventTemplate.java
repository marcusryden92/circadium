package app.circadium.persistence.entity;

import app.circadium.persistence.enums.WeekDayType;
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
@Table(name = "EventTemplates")
@Getter
@Setter
public class EventTemplate {

    @Id
    private String id;

    private String title;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private WeekDayType startDay;

    private String startTime;

    private String userId;

    private int duration;

    private String color;

    private String locationId;

    private String recurrenceExceptions;

    private String createdAt;

    private String updatedAt;

}
