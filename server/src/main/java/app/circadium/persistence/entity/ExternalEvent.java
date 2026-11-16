package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "ExternalEvents")
@Getter
@Setter
public class ExternalEvent {

    @Id
    private String id;

    private String sourceId;

    private String userId;

    private String uid;

    private String title;

    private String start;

    private String end;

    private boolean allDay;

}
