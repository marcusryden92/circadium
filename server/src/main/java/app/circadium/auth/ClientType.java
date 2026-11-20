package app.circadium.auth;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;
import java.util.Optional;

/**
 * The kinds of app that sign in. They differ in where tokens travel: the web app receives them as HttpOnly cookies
 * (see {@link AuthCookies}), the mobile app in the JSON body. Each also has one fixed Google sign-in completion URL.
 */
public enum ClientType {
    WEB("web"),
    MOBILE("mobile");

    private final String parameter;

    ClientType(String parameter) {
        this.parameter = parameter;
    }

    /** The value of the {@code client} request field or query parameter, also stored on handoff codes. */
    @JsonValue
    public String parameter() {
        return parameter;
    }

    public static Optional<ClientType> fromParameter(String value) {
        return Arrays.stream(values()).filter(client -> client.parameter.equals(value)).findFirst();
    }
}
