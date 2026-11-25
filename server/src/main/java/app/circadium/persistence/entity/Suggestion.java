package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "Suggestions")
@Getter
@Setter
public class Suggestion {

    @Id
    private String id;

    private String title;

    private String body;

    private String userId;

    private Instant createdAt;

}
