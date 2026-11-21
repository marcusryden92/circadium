package app.circadium.persistence.repository;

import app.circadium.TestcontainersConfiguration;
import app.circadium.persistence.entity.Location;
import app.circadium.persistence.entity.User;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class LocationRepositoryTest {

    @Autowired
    LocationRepository locationRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    EntityManager entityManager;

    @Test
    void persistAndReloadLocation() {
        String userId = UUID.randomUUID().toString();
        User user = new User();
        user.setId(userId);
        user.setEmail("location-owner@example.com");
        userRepository.saveAndFlush(user);

        String id = UUID.randomUUID().toString();
        Location location = new Location();
        location.setId(id);
        location.setName("Office");
        location.setAddress("1 Market St, Stockholm");
        location.setPlaceId("ChIJ_place_id");
        location.setLat(59.3293);
        location.setLng(18.0686);
        location.setUserId(userId);
        location.setCreatedAt(Instant.parse("2026-11-16T08:00:00Z"));
        location.setUpdatedAt(Instant.parse("2026-11-16T08:00:00Z"));

        locationRepository.saveAndFlush(location);
        entityManager.clear();

        Location loaded = locationRepository.findById(id).orElseThrow();
        assertEquals("Office", loaded.getName());
        assertEquals("1 Market St, Stockholm", loaded.getAddress());
        assertEquals("ChIJ_place_id", loaded.getPlaceId());
        assertEquals(59.3293, loaded.getLat(), 1e-9);
        assertEquals(18.0686, loaded.getLng(), 1e-9);
        assertEquals(Instant.parse("2026-11-16T08:00:00Z"), loaded.getCreatedAt());
    }
}
