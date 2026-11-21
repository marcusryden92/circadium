package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "Habits")
@Getter
@Setter
public class Habit {

    @Id
    private String id;

    private String userId;

    private String name;

    private String color;

    private String bucketId;

    private int sortOrder;

    private String createdAt;

    private String updatedAt;

}
