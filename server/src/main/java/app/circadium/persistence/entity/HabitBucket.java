package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "HabitBuckets")
@Getter
@Setter
public class HabitBucket {

    @Id
    private String id;

    private String userId;

    private String name;

    private String color;

    private int sortOrder;

    private Instant createdAt;

    private Instant updatedAt;

}
