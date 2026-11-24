package app.circadium.calendar;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Pins the ECMAScript whitespace class the ported draft-conversation surface depends on — the
 * two directions Java's own classification gets wrong: NBSP/Zs/FEFF are JS whitespace but not
 * Java-trim/isBlank whitespace, and the C0 controls outside TAB/LF/VT/FF/CR are Java whitespace
 * but not JS whitespace.
 */
class JsTextTest {

    private static final String NBSP = "\u00a0";
    private static final String FEFF = "\ufeff";
    private static final String IDEOGRAPHIC_SPACE = "\u3000";
    private static final String NARROW_NBSP = "\u202f";
    private static final String LINE_SEPARATOR = "\u2028";
    private static final String FILE_SEPARATOR = "\u001c";
    private static final String START_OF_HEADING = "\u0001";

    @Test
    void trimStripsTheJsWhitespaceSet() {
        assertThat(JsText.trim(NBSP + "abc" + NBSP)).isEqualTo("abc");
        assertThat(JsText.trim(FEFF + "abc")).isEqualTo("abc");
        assertThat(JsText.trim(IDEOGRAPHIC_SPACE + "abc" + NARROW_NBSP)).isEqualTo("abc");
        assertThat(JsText.trim(LINE_SEPARATOR + "abc" + LINE_SEPARATOR)).isEqualTo("abc");
        assertThat(JsText.trim(" \t\r\nabc \t")).isEqualTo("abc");
    }

    @Test
    void trimKeepsC0ControlsJavaWouldStrip() {
        assertThat(JsText.trim(START_OF_HEADING + "abc")).isEqualTo(START_OF_HEADING + "abc");
        assertThat(JsText.trim("abc" + FILE_SEPARATOR)).isEqualTo("abc" + FILE_SEPARATOR);
    }

    @Test
    void isBlankFollowsTheSameClass() {
        assertThat(JsText.isBlank("")).isTrue();
        assertThat(JsText.isBlank(NBSP + NARROW_NBSP + FEFF + IDEOGRAPHIC_SPACE)).isTrue();
        assertThat(JsText.isBlank(" \t\r\n\f")).isTrue();
        assertThat(JsText.isBlank(FILE_SEPARATOR)).isFalse();
        assertThat(JsText.isBlank(START_OF_HEADING)).isFalse();
        assertThat(JsText.isBlank("a")).isFalse();
    }
}
