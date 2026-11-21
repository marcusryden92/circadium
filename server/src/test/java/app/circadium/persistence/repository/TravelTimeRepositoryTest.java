package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Location;
import app.circadium.persistence.entity.TravelTime;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.TransportMode;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class TravelTimeRepositoryTest {

    @Autowired
    TravelTimeRepository travelTimeRepository;

    @Autowired
    LocationRepository locationRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadTravelTime() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("travel-time-owner@example.com");
        userRepository.saveAndFlush(user);

        String fromId = seedLocation(userId, "Home", "place-home");
        String toId = seedLocation(userId, "Office", "place-office");

        String id = UUID.randomUUID().toString();
        TravelTime travelTime = new TravelTime();
        travelTime.setId(id);
        travelTime.setFromLocationId(fromId);
        travelTime.setToLocationId(toId);
        travelTime.setTransportMode(TransportMode.DRIVING);
        travelTime.setGoogleRushHourMinutes(40);
        travelTime.setGoogleRegularMinutes(25);
        travelTime.setGoogleNightMinutes(18);
        travelTime.setUserId(userId);
        travelTime.setCreatedAt(Instant.parse("2026-11-16T08:00:00Z"));
        travelTime.setUpdatedAt(Instant.parse("2026-11-16T08:00:00Z"));

        travelTimeRepository.saveAndFlush(travelTime);
        entityManager.clear();

        TravelTime loaded = travelTimeRepository.findById(id).orElseThrow();
        assertEquals(fromId, loaded.getFromLocationId());
        assertEquals(toId, loaded.getToLocationId());
        assertEquals(TransportMode.DRIVING, loaded.getTransportMode());
        assertEquals(40, loaded.getGoogleRushHourMinutes());
        assertNull(loaded.getCustomRushHourMinutes());
        assertNull(loaded.getUnroutableAt());
    }

    private String seedLocation(String userId, String name, String placeId) {
        String id = UUID.randomUUID().toString();
        Location location = new Location();
        location.setId(id);
        location.setName(name);
        location.setAddress(name + " address");
        location.setPlaceId(placeId);
        location.setLat(0.0);
        location.setLng(0.0);
        location.setUserId(userId);
        location.setCreatedAt(Instant.parse("2026-11-16T08:00:00Z"));
        location.setUpdatedAt(Instant.parse("2026-11-16T08:00:00Z"));
        locationRepository.saveAndFlush(location);
        return id;
    }
}
