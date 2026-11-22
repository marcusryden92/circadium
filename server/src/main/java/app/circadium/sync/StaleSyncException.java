package app.circadium.sync;

import app.circadium.calendar.CalendarContracts.BootstrapPayload;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * A sync computed against an older {@code dataVersion}. The ProblemDetail ({@code code: "stale"}) carries the
 * account's current state as {@code freshState}, so the client can start over from it without another round trip.
 */
public class StaleSyncException extends ErrorResponseException {

    public StaleSyncException(BootstrapPayload freshState) {
        super(HttpStatus.CONFLICT, problem(freshState), null);
    }

    /** Fixed, because the default message prints the ProblemDetail, and with it the user's whole calendar, to the log. */
    @Override
    public String getMessage() {
        return "Sync rejected as stale";
    }

    private static ProblemDetail problem(BootstrapPayload freshState) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "Another session saved first. Start over from freshState.");
        problem.setProperty("code", "stale");
        problem.setProperty("freshState", freshState);
        return problem;
    }
}
