package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "PasswordResetToken")
@Getter
@Setter
public class PasswordResetToken {

    @Id
    private String id;

    private String email;

    private String token;

    private Instant expires;

}
