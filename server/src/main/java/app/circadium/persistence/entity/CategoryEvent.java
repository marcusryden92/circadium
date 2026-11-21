package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "CategoryEvents")
@Getter
@Setter
public class CategoryEvent {

    @Id
    private String id;

    private String start;

    private String end;

    private boolean trespassingStart;

    private boolean trespassingEnd;

    private String categoryTimeWindowId;

    private String categoryId;

    private String userId;

    private String createdAt;

    private String updatedAt;

}
