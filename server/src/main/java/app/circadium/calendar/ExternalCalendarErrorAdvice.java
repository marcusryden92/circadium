package app.circadium.calendar;

import app.circadium.external.CalendarProviderException;
import app.circadium.external.ics.IcsFeedException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps the external-calendar domain's user-facing failures onto the API's ProblemDetail shape.
 * The detail text is contract: the retired actions returned these strings verbatim and the UI
 * shows them as-is. The refresh endpoint handles its own failures (it must write lastError and
 * carry the source in the body), so these handlers only see the add/list/connect paths.
 */
@RestControllerAdvice
class ExternalCalendarErrorAdvice {

    @ExceptionHandler(CalendarProviderException.class)
    ProblemDetail providerError(CalendarProviderException exception) {
        return problem("provider_error", exception.getMessage());
    }

    @ExceptionHandler(IcsFeedException.class)
    ProblemDetail feedError(IcsFeedException exception) {
        return problem("feed_error", exception.getMessage());
    }

    private static ProblemDetail problem(String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, detail);
        problem.setProperty("code", code);
        return problem;
    }
}
