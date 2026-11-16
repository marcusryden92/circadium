package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "AccountDeletionToken")
@Getter
@Setter
public class AccountDeletionToken {

    @Id
    private String id;

    private String userId;

    private String token;

    private Instant expires;

}
