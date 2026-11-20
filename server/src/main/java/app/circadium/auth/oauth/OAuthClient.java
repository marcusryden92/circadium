package app.circadium.auth.oauth;

import java.util.Arrays;
import java.util.Optional;

/** The kinds of app that can start a sign-in. Each has one fixed completion URL in {@link OAuthProperties}. */
public enum OAuthClient {
    WEB("web"),
    MOBILE("mobile");

    private final String parameter;

    OAuthClient(String parameter) {
        this.parameter = parameter;
    }

    /** The value of the {@code client} query parameter, also stored on the handoff code. */
    public String parameter() {
        return parameter;
    }

    static Optional<OAuthClient> fromParameter(String value) {
        return Arrays.stream(values()).filter(client -> client.parameter.equals(value)).findFirst();
    }
}
