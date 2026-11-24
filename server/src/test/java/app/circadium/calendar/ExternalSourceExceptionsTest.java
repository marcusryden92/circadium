package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The modeExceptions / locationExceptions column semantics the TS helpers pinned. */
class ExternalSourceExceptionsTest {

    @Test
    void togglingAddsThenRemovesAUid() {
        String added = ExternalSourceExceptions.toggleModeException(null, "uid-1");
        assertThat(added).isEqualTo("[\"uid-1\"]");

        String both = ExternalSourceExceptions.toggleModeException(added, "uid-2");
        assertThat(both).isEqualTo("[\"uid-1\",\"uid-2\"]");

        String removed = ExternalSourceExceptions.toggleModeException(both, "uid-1");
        assertThat(removed).isEqualTo("[\"uid-2\"]");

        assertThat(ExternalSourceExceptions.toggleModeException(removed, "uid-2")).isNull();
    }

    @Test
    void aDuplicatedUidClearsInOneToggle() {
        // The TS filter removed every copy; leaving one behind would make the flip look stuck.
        assertThat(ExternalSourceExceptions.toggleModeException("[\"uid-1\",\"uid-1\"]", "uid-1"))
                .isNull();
    }

    @Test
    void malformedModeExceptionsReadAsEmpty() {
        assertThat(ExternalSourceExceptions.parseModeExceptions("not json")).isEmpty();
        assertThat(ExternalSourceExceptions.parseModeExceptions("{\"a\":1}")).isEmpty();
        assertThat(ExternalSourceExceptions.parseModeExceptions("[\"ok\", 7, null]"))
                .containsExactly("ok");
    }

    @Test
    void locationOverridesDistinguishNullFromAbsent() {
        String pinned = ExternalSourceExceptions.setLocationException(null, "uid-1", "location-1");
        assertThat(pinned).isEqualTo("{\"uid-1\":\"location-1\"}");

        // null value = explicit "Anywhere", distinct from an absent key (inherit the default).
        String anywhere = ExternalSourceExceptions.setLocationException(pinned, "uid-2", null);
        assertThat(anywhere).isEqualTo("{\"uid-1\":\"location-1\",\"uid-2\":null}");
        assertThat(ExternalSourceExceptions.parseLocationExceptions(anywhere))
                .containsEntry("uid-2", null);

        String cleared = ExternalSourceExceptions.clearLocationException(anywhere, "uid-1");
        assertThat(cleared).isEqualTo("{\"uid-2\":null}");

        assertThat(ExternalSourceExceptions.clearLocationException(cleared, "uid-2")).isNull();
    }

    @Test
    void malformedLocationExceptionsReadAsEmpty() {
        assertThat(ExternalSourceExceptions.parseLocationExceptions("not json")).isEmpty();
        assertThat(ExternalSourceExceptions.parseLocationExceptions("[1,2]")).isEmpty();
        assertThat(ExternalSourceExceptions.parseLocationExceptions("{\"uid\":7}")).isEmpty();
    }
}
