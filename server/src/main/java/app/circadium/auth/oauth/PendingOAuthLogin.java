package app.circadium.auth.oauth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.io.Serializable;

/** Who started the sign-in in progress; kept in the session between the start and Google's callback. */
record PendingOAuthLogin(OAuthClient client, String challenge) implements Serializable {

    static final String SESSION_ATTRIBUTE = PendingOAuthLogin.class.getName();

    void store(HttpServletRequest request) {
        request.getSession(true).setAttribute(SESSION_ATTRIBUTE, this);
    }

    /**
     * Reads the pending sign-in and ends the session, which is only needed for the round trip to Google. Null when
     * this browser has no sign-in in progress (never started, timed out, or already finished).
     */
    static PendingOAuthLogin take(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return null;
        }
        Object pending = session.getAttribute(SESSION_ATTRIBUTE);
        session.invalidate();
        return pending instanceof PendingOAuthLogin login ? login : null;
    }
}
