package app.circadium.persistence.entity;

import app.circadium.persistence.enums.EnergyLevel;
import app.circadium.persistence.enums.PriorityLevel;
import app.circadium.persistence.enums.TaskTypeEnum;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;

@Entity
@Table(name = "TaskPreferences")
@Getter
@Setter
public class TaskPreferences {

    @Id
    private String id;

    private String plannerId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private TaskTypeEnum taskType;

    @JdbcTypeCode(SqlTypes.ARRAY)
    private List<Integer> preferredDays;

    private String preferredStartTime;

    private String preferredEndTime;

    @JdbcTypeCode(SqlTypes.ARRAY)
    private List<Integer> avoidDays;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private PriorityLevel priority;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private EnergyLevel energyLevel;

    private boolean allowFlexibility;

}
