package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "Locations")
@Getter
@Setter
public class Location {

    @Id
    private String id;

    private String name;

    private String address;

    private String placeId;

    private double lat;

    private double lng;

    private String userId;

    private Instant createdAt;

    private Instant updatedAt;

}
