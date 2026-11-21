package app.circadium.external.passwords;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class PwnedPasswordsClientTest {

    /** SHA-1("password"), uppercase: 5BAA6 + 1E4C9B93F3F0682250B6CF8331B7EE68FD8. */
    private static final String PREFIX = "5BAA6";
    private static final String SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

    private MockRestServiceServer server;
    private PwnedPasswordsClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new PwnedPasswordsClient(builder, new PwnedPasswordsProperties(true, "https://pwned.test"));
    }

    @Test
    void sendsOnlyTheFirstFiveHashCharactersAndAsksForPadding() {
        server.expect(once(), requestTo("https://pwned.test/range/" + PREFIX))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Add-Padding", "true"))
                .andRespond(withSuccess("0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n" + SUFFIX + ":10434004\r\n",
                        MediaType.TEXT_PLAIN));

        assertThat(client.isBreached("password")).isTrue();
        server.verify();
    }

    @Test
    void aSuffixListedOnlyAsPaddingIsNotBreached() {
        server.expect(once(), requestTo("https://pwned.test/range/" + PREFIX))
                .andRespond(withSuccess(SUFFIX + ":0\r\n", MediaType.TEXT_PLAIN));

        assertThat(client.isBreached("password")).isFalse();
    }

    @Test
    void anUnlistedSuffixIsNotBreached() {
        server.expect(once(), requestTo("https://pwned.test/range/" + PREFIX))
                .andRespond(withSuccess("0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n", MediaType.TEXT_PLAIN));

        assertThat(client.isBreached("password")).isFalse();
    }

    @Test
    void anUnreachableServiceAcceptsThePassword() {
        server.expect(once(), requestTo("https://pwned.test/range/" + PREFIX)).andRespond(withServerError());

        assertThat(client.isBreached("password")).isFalse();
    }

    @Test
    void hashesAsTheApiExpects() {
        assertThat(PwnedPasswordsClient.sha1Hex("password")).isEqualTo(PREFIX + SUFFIX);
    }
}
