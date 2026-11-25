package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "HabitCompletions")
@Getter
@Setter
public class OccurrenceCompletion {

    @Id
    private String id;

    private String plannerId;

    private String userId;

    private String occurrenceKey;

    private String start;

    private String end;

    private Instant createdAt;

}
