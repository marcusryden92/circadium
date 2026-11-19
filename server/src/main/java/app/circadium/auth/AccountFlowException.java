package app.circadium.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * A rejected emailed-link or account-management request. The ProblemDetail carries a stable {@code code}
 * so clients can choose their own wording (for example "request a new link" on {@code expired_token}).
 */
public class AccountFlowException extends ErrorResponseException {

    public AccountFlowException(HttpStatus status, String code, String detail) {
        super(status, problem(status, code, detail), null);
    }

    static AccountFlowException invalidLink() {
        return new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_token",
                "This link is invalid or has already been used.");
    }

    static AccountFlowException expiredLink() {
        return new AccountFlowException(HttpStatus.BAD_REQUEST, "expired_token",
                "This link has expired. Request a new one.");
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setProperty("code", code);
        return problem;
    }
}
