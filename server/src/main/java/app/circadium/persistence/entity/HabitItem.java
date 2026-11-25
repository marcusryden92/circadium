package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "HabitItems")
@Getter
@Setter
public class HabitItem {

    @Id
    private String id;

    private String habitId;

    private String plannerId;

    private String userId;

    private Instant createdAt;

}
