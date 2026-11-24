package app.circadium.external.maps;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** The deployment has no {@code GOOGLE_MAPS_API_KEY}, so location search and travel times are off. */
public class MapsNotConfiguredException extends ErrorResponseException {

    public MapsNotConfiguredException() {
        super(HttpStatus.SERVICE_UNAVAILABLE, problem(), null);
    }

    private static ProblemDetail problem() {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "Location search is not available right now.");
        problem.setProperty("code", "maps_not_configured");
        return problem;
    }
}
