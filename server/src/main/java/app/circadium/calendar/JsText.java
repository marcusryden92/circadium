package app.circadium.calendar;

/**
 * JavaScript string-whitespace semantics for ported TS surfaces. {@code String.trim()} and
 * {@code String.isBlank()} classify differently than JS {@code trim()}: Java strips every code
 * point at or below U+0020 (all C0 controls) and keeps NBSP/Zs/FEFF, while ECMAScript strips
 * exactly TAB, LF, VT, FF, CR, the Zs category (NBSP included), U+2028/U+2029 and U+FEFF — so a
 * ported trim or blank check must use these helpers or exotic-whitespace input diverges from the
 * retired action (different stored primary keys, flipped "Untitled"/"Nothing to save" verdicts).
 */
final class JsText {

    private JsText() {
    }

    static String trim(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && isJsWhitespace(value.codePointAt(start))) {
            start += Character.charCount(value.codePointAt(start));
        }
        while (end > start) {
            int codePoint = value.codePointBefore(end);
            if (!isJsWhitespace(codePoint)) {
                break;
            }
            end -= Character.charCount(codePoint);
        }
        return value.substring(start, end);
    }

    static boolean isBlank(String value) {
        for (int i = 0; i < value.length(); ) {
            int codePoint = value.codePointAt(i);
            if (!isJsWhitespace(codePoint)) {
                return false;
            }
            i += Character.charCount(codePoint);
        }
        return true;
    }

    private static boolean isJsWhitespace(int codePoint) {
        return codePoint == '\t' || codePoint == '\n' || codePoint == 0x0B || codePoint == '\f'
                || codePoint == '\r' || codePoint == 0xFEFF || codePoint == 0x2028 || codePoint == 0x2029
                || Character.getType(codePoint) == Character.SPACE_SEPARATOR;
    }
}
