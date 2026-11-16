package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "SimpleEvents")
@Getter
@Setter
public class SimpleEvent {

    @Id
    private String id;

    private String title;

    private String start;

    private String end;

    private Integer duration;

    private String userId;

    private String rrule;

    private String backgroundColor;

    private String borderColor;

    private String createdAt;

    private String updatedAt;

}
