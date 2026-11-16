package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "TwoFactorToken")
@Getter
@Setter
public class TwoFactorToken {

    @Id
    private String id;

    private String email;

    private String token;

    private Instant expires;

}
