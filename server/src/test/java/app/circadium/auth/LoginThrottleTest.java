package app.circadium.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class LoginThrottleTest {

    @Test
    void firstFourFailuresAreFree() {
        for (int attempts = 1; attempts <= 4; attempts++) {
            assertThat(LoginThrottle.lockDurationAfter(attempts)).isEmpty();
        }
    }

    @Test
    void lockDoublesFromOneMinute() {
        assertThat(LoginThrottle.lockDurationAfter(5)).contains(Duration.ofMinutes(1));
        assertThat(LoginThrottle.lockDurationAfter(6)).contains(Duration.ofMinutes(2));
        assertThat(LoginThrottle.lockDurationAfter(7)).contains(Duration.ofMinutes(4));
        assertThat(LoginThrottle.lockDurationAfter(10)).contains(Duration.ofMinutes(32));
    }

    @Test
    void lockIsCappedAtOneHour() {
        assertThat(LoginThrottle.lockDurationAfter(11)).contains(Duration.ofHours(1));
        assertThat(LoginThrottle.lockDurationAfter(1_000)).contains(Duration.ofHours(1));
    }
}
