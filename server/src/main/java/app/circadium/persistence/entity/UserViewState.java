package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "UserViewStates")
@Getter
@Setter
public class UserViewState {

    @Id
    private String id;

    private String userId;

    private String graph;

    private String mindmap;

    private Instant updatedAt;

}
