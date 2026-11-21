package app.circadium.persistence.entity;

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
@Table (name = "Planners")
@Getter 
@Setter
public class Planner {
    
    @Id 
    private String id;

    private String title;

    private String parentId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private PlannerType plannerType;

    private Boolean isReady;

    private boolean isTriaged;

    private int duration;

    private String deadline;

    private String starts;

    private String recurrence;

    private String recurrenceExceptions;

    private String splitting;

    private String completedSegments;

    private Integer maxMinutesPerDay;

    private String earliestStartDate;

    private String allowedTimes;

    private String linkedItemId;

    private String notes;

    private double sortOrder;

    private String completedStartTime;

    private String completedEndTime;

    private int priority;

    private String userId;

    private String color;

    private String locationId;

    private boolean useParentLocation;

    private String categoryId;

    private String createdAt;

    private String updatedAt;


}
