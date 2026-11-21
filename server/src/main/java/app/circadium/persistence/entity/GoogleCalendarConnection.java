package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "GoogleCalendarConnections")
@Getter
@Setter
public class GoogleCalendarConnection {

    @Id
    private String id;

    private String userId;

    private String email;

    private String refreshToken;

    private Instant createdAt;

    private Instant updatedAt;

}
