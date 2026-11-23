package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "PlannerDependencies")
@Getter
@Setter
public class PlannerDependency {

    @Id
    private String id;

    private String predecessorId;

    private String successorId;

    private String userId;

    private Instant createdAt;

    private Instant updatedAt;

}
