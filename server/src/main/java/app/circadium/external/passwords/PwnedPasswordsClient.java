package app.circadium.external.passwords;

import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Looks a password up with k-anonymity: only the first 5 hex characters of its SHA-1 are sent, and the API answers
 * with every breached hash suffix under that prefix (several hundred), which are compared here. SHA-1 is the API's
 * lookup key, not a way of storing anything.
 *
 * <p>{@code Add-Padding} makes every response the same size, so the response length says nothing about the
 * password either. Padding rows carry a count of 0. If the API cannot be reached the password is accepted: the
 * length rules still hold, and sign-up must not depend on a third party being up.
 */
@Slf4j
public class PwnedPasswordsClient implements BreachedPasswords {

    private static final int PREFIX_LENGTH = 5;

    private final RestClient restClient;

    PwnedPasswordsClient(RestClient.Builder restClientBuilder, PwnedPasswordsProperties properties) {
        this.restClient = restClientBuilder
                .baseUrl(properties.baseUrl())
                .defaultHeader("Add-Padding", "true")
                .defaultHeader(HttpHeaders.USER_AGENT, "circadium-server")
                .build();
    }

    public static PwnedPasswordsClient create(PwnedPasswordsProperties properties) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
        requestFactory.setReadTimeout(Duration.ofSeconds(3));
        return new PwnedPasswordsClient(RestClient.builder().requestFactory(requestFactory), properties);
    }

    @Override
    public boolean isBreached(String password) {
        String hash = sha1Hex(password);
        String suffix = hash.substring(PREFIX_LENGTH);
        String body;
        try {
            body = restClient.get()
                    .uri("/range/{prefix}", hash.substring(0, PREFIX_LENGTH))
                    .retrieve()
                    .body(String.class);
        } catch (RestClientException e) {
            log.warn("Breached-password check unavailable ({}); accepting the password", e.getMessage());
            return false;
        }
        return body != null && body.lines().anyMatch(line -> listsSuffix(line, suffix));
    }

    /** One response line is {@code SUFFIX:COUNT}. */
    static boolean listsSuffix(String line, String suffix) {
        int colon = line.indexOf(':');
        if (colon < 0 || !line.substring(0, colon).trim().equalsIgnoreCase(suffix)) {
            return false;
        }
        try {
            return Long.parseLong(line.substring(colon + 1).trim()) > 0;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    static String sha1Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().withUpperCase().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-1 is unavailable", e);
        }
    }
}
