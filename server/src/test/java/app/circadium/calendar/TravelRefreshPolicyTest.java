package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;

import app.circadium.calendar.TravelRefreshPolicy.BudgetReservation;
import app.circadium.calendar.TravelRefreshPolicy.RefreshAllVerdict;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** The ported policy thresholds, pinned against the retired TS unit tests' intent. */
class TravelRefreshPolicyTest {

    private static final Instant NOW = Instant.parse("2026-04-15T12:00:00Z");

    @Test
    void topUpAllowanceIsDaily() {
        assertThat(TravelRefreshPolicy.topUpAllowed(NOW, null)).isTrue();
        assertThat(TravelRefreshPolicy.topUpAllowed(NOW, NOW.minus(Duration.ofHours(24)))).isTrue();
        assertThat(TravelRefreshPolicy.topUpAllowed(NOW, NOW.minus(Duration.ofHours(23)))).isFalse();
    }

    @Test
    void timeVaryingModesBillThreeElementsPerPair() {
        assertThat(TravelRefreshPolicy.elementsForPairs(4, true)).isEqualTo(12);
        assertThat(TravelRefreshPolicy.elementsForPairs(4, false)).isEqualTo(4);
    }

    @Test
    void reservationAccumulatesWithinTheMonthAndResetsOnTheFirst() {
        Instant period = TravelRefreshPolicy.monthStartUtc(NOW);
        assertThat(period).isEqualTo(Instant.parse("2026-04-01T00:00:00Z"));

        BudgetReservation sameMonth = TravelRefreshPolicy.reserveElements(NOW, 30, 100, period, 4500);
        assertThat(sameMonth.allowed()).isTrue();
        assertThat(sameMonth.nextCount()).isEqualTo(130);

        BudgetReservation rolledOver = TravelRefreshPolicy.reserveElements(NOW, 30, 4499,
                Instant.parse("2026-03-01T00:00:00Z"), 4500);
        assertThat(rolledOver.allowed()).isTrue();
        assertThat(rolledOver.nextCount()).isEqualTo(30);

        BudgetReservation refused = TravelRefreshPolicy.reserveElements(NOW, 30, 4480, period, 4500);
        assertThat(refused.allowed()).isFalse();
        assertThat(refused.reason()).contains("monthly travel-time budget");
    }

    @Test
    void routableRowsAgeOutAfterTheTtlAndUnroutableAfterTheRetryWindow() {
        assertThat(TravelRefreshPolicy.needsRefetch(NOW.minus(Duration.ofDays(180)), null, NOW)).isTrue();
        assertThat(TravelRefreshPolicy.needsRefetch(NOW.minus(Duration.ofDays(179)), null, NOW)).isFalse();
        assertThat(TravelRefreshPolicy.needsRefetch(NOW.minus(Duration.ofDays(200)),
                NOW.minus(Duration.ofDays(30)), NOW)).isTrue();
        assertThat(TravelRefreshPolicy.needsRefetch(NOW.minus(Duration.ofDays(200)),
                NOW.minus(Duration.ofDays(29)), NOW)).isFalse();
    }

    @Test
    void refreshAllGatesOnTheActionAndOnTheOldestRow() {
        RefreshAllVerdict cooldown = TravelRefreshPolicy.refreshAllGate(NOW,
                NOW.minus(Duration.ofMinutes(59)), null);
        assertThat(cooldown.allowed()).isFalse();
        assertThat(cooldown.reason()).contains("less than an hour ago");

        RefreshAllVerdict freshRows = TravelRefreshPolicy.refreshAllGate(NOW,
                NOW.minus(Duration.ofHours(2)), NOW.minus(Duration.ofMinutes(30)));
        assertThat(freshRows.allowed()).isFalse();
        assertThat(freshRows.reason()).contains("under an hour old");

        assertThat(TravelRefreshPolicy.refreshAllGate(NOW, NOW.minus(Duration.ofHours(2)),
                NOW.minus(Duration.ofHours(2))).allowed()).isTrue();
        assertThat(TravelRefreshPolicy.refreshAllGate(NOW, null, null).allowed()).isTrue();
    }
}
