package app.circadium.external.ics;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The web's icsUrl test cases, ported verbatim. */
class IcsUrlsTest {

    @Test
    void acceptsHttpsRewritesWebcalRejectsGarbage() {
        assertThat(IcsUrls.normalize("https://example.com/cal.ics")).isEqualTo("https://example.com/cal.ics");
        assertThat(IcsUrls.normalize("webcal://example.com/cal.ics"))
                .isEqualTo("https://example.com/cal.ics");
        assertThat(IcsUrls.normalize("example.com/cal.ics")).isEqualTo("https://example.com/cal.ics");
        assertThat(IcsUrls.normalize("")).isNull();
        assertThat(IcsUrls.normalize("not a url at all")).isNull();
    }

    @Test
    void percentEncodesPathSpacesLikeTheWhatwgParserDid() {
        assertThat(IcsUrls.normalize("https://example.com/my feed.ics"))
                .isEqualTo("https://example.com/my%20feed.ics");
        assertThat(IcsUrls.normalize("https://bad host/cal.ics")).isNull();
    }

    @Test
    void lowercasesSchemeAndHostLikeTheWhatwgSerializer() {
        assertThat(IcsUrls.normalize("HTTPS://Example.COM/Cal.ICS"))
                .isEqualTo("https://example.com/Cal.ICS");
        assertThat(IcsUrls.normalize("WEBCAL://Example.com/cal.ics"))
                .isEqualTo("https://example.com/cal.ics");
    }

    @Test
    void stripsDefaultPortsAndGivesABareAuthorityTheRootPath() {
        assertThat(IcsUrls.normalize("https://example.com:443/cal.ics"))
                .isEqualTo("https://example.com/cal.ics");
        assertThat(IcsUrls.normalize("https://example.com:8443/cal.ics"))
                .isEqualTo("https://example.com:8443/cal.ics");
        assertThat(IcsUrls.normalize("https://example.com")).isEqualTo("https://example.com/");
        assertThat(IcsUrls.normalize("example.com")).isEqualTo("https://example.com/");
    }

    @Test
    void acceptsWhatwgSpecialsTheJavaParserRefuses() {
        // Braces match the WHATWG percent-encoding exactly; the pipe stayed raw there but must
        // at least be ACCEPTED here (same fetch target either way).
        assertThat(IcsUrls.normalize("https://example.com/a{b}.ics"))
                .isEqualTo("https://example.com/a%7Bb%7D.ics");
        assertThat(IcsUrls.normalize("https://example.com/a|b.ics"))
                .isEqualTo("https://example.com/a%7Cb.ics");
        assertThat(IcsUrls.normalize("https://example.com/cal.ics?x=a b"))
                .isEqualTo("https://example.com/cal.ics?x=a%20b");
    }

    @Test
    void readsPathBackslashesAsSlashesLikeSpecialUrls() {
        assertThat(IcsUrls.normalize("https://example.com\\a\\b.ics"))
                .isEqualTo("https://example.com/a/b.ics");
    }

    @Test
    void decodesTheCidFromASharingLink() {
        // dXNlckBleGFtcGxlLmNvbQ == base64url("user@example.com")
        assertThat(IcsUrls.googleShareLinkCalendarId(
                "https://calendar.google.com/calendar/u/1?cid=dXNlckBleGFtcGxlLmNvbQ"))
                .isEqualTo("user@example.com");
    }

    @Test
    void detectsAMixedCaseSharingLink() {
        assertThat(IcsUrls.googleShareLinkCalendarId(
                "https://Calendar.Google.COM/calendar/u/1?cid=dXNlckBleGFtcGxlLmNvbQ"))
                .isEqualTo("user@example.com");
    }

    @Test
    void ignoresRealIcsFeedUrlsAndNonGoogleHosts() {
        assertThat(IcsUrls.googleShareLinkCalendarId(
                "https://calendar.google.com/calendar/ical/user%40example.com/private-abc123/basic.ics"))
                .isNull();
        assertThat(IcsUrls.googleShareLinkCalendarId("https://example.com/?cid=dXNlckBleGFtcGxlLmNvbQ"))
                .isNull();
        assertThat(IcsUrls.googleShareLinkCalendarId("https://calendar.google.com/calendar/u/0/r"))
                .isNull();
    }

    @Test
    void buildsThePublicFeedUrlForADecodedId() {
        assertThat(IcsUrls.googlePublicIcsUrl("user@example.com"))
                .isEqualTo("https://calendar.google.com/calendar/ical/user%40example.com/public/basic.ics");
    }
}
