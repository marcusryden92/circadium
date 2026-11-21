package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "VerificationToken")
@Getter
@Setter
public class VerificationToken {

    @Id
    private String id;

    private String email;

    private String token;

    private Instant expires;

    private String userId;

}
