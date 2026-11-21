package app.circadium.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;

/** Who is calling, for audit rows and session device names. */
public record ClientInfo(String ipAddress, String userAgent) {

    private static final int MAX_USER_AGENT_LENGTH = 255;

    public static final ClientInfo UNKNOWN = new ClientInfo(null, null);

    /**
     * {@code getRemoteAddr()} is already the real client address on Fly, because staging/prod run with
     * {@code server.forward-headers-strategy: native}, which only trusts forwarding headers from internal proxies.
     */
    public static ClientInfo from(HttpServletRequest request) {
        String userAgent = request.getHeader(HttpHeaders.USER_AGENT);
        if (userAgent != null && userAgent.length() > MAX_USER_AGENT_LENGTH) {
            userAgent = userAgent.substring(0, MAX_USER_AGENT_LENGTH);
        }
        return new ClientInfo(request.getRemoteAddr(), userAgent);
    }
}
