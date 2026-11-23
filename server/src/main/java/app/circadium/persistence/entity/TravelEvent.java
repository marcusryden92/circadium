package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "TravelEvents")
@Getter
@Setter
public class TravelEvent {

    @Id
    private String id;

    private String start;

    private String end;

    private String fromLocationId;

    private String toLocationId;

    private int travelMinutes;

    private Integer requiredTravelMinutes;

    private boolean insufficientTravel;

    private boolean overconstrained;

    private String userId;

    private Instant createdAt;

    private Instant updatedAt;

}
