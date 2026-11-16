package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "Queues")
@Getter
@Setter
public class Queue {

    @Id
    private String id;

    private String title;

    private int sortOrder;

    private String color;

    private String categoryId;

    private String userId;

    private String createdAt;

    private String updatedAt;

}
