package app.circadium.admin;

import app.circadium.auth.AccountFlowException;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.repository.FeedbackReportRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The ADMIN-only surface over FeedbackReport rows, ported from {@code actions/adminFeedback.ts}. The
 * inspector renders the stored snapshot blob client-side; nothing here ever hydrates the admin's own
 * state. The gate (ADMIN role + a 2FA-verified sign-in) is the security chain's {@code /admin/**} rule.
 */
@RestController
@RequiredArgsConstructor
@Tag(name = "Admin")
public class AdminFeedbackController {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final FeedbackReportRepository feedbackReportRepository;
    private final JdbcTemplate jdbcTemplate;

    public record FeedbackReportSummary(String id, String message, Instant createdAt, boolean hasSnapshot,
            String userName, String userEmail) {}

    @GetMapping("/admin/feedback-reports")
    @Operation(summary = "List feedback reports",
            description = "Every report, newest first, with the reporting user's name and email. The "
                    + "snapshot blobs never ride the list — only their presence does.")
    @ApiResponse(responseCode = "200", description = "The reports")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "403", description = "Not an ADMIN with a 2FA-verified sign-in")
    public List<FeedbackReportSummary> list() {
        // The TS action resolved snapshot presence with a second id-only query so Prisma never
        // selected the blobs; IS NOT NULL in the projection is the same effect in one statement.
        return jdbcTemplate.query("SELECT f.\"id\", f.\"message\", f.\"createdAt\", "
                        + "f.\"dataSnapshot\" IS NOT NULL AS \"hasSnapshot\", u.\"name\", u.\"email\" "
                        + "FROM \"FeedbackReports\" f JOIN \"users\" u ON u.\"id\" = f.\"userId\" "
                        + "ORDER BY f.\"createdAt\" DESC",
                (rs, i) -> new FeedbackReportSummary(rs.getString("id"), rs.getString("message"),
                        DbTime.fromDb(rs.getObject("createdAt", java.time.LocalDateTime.class)),
                        rs.getBoolean("hasSnapshot"), rs.getString("name"), rs.getString("email")));
    }

    @GetMapping("/admin/feedback-reports/{reportId}/snapshot")
    @Operation(summary = "Load a report's data snapshot",
            description = "The stored export blob, or JSON null when the report has none.")
    @ApiResponse(responseCode = "200", description = "The snapshot, or null")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "403", description = "Not an ADMIN with a 2FA-verified sign-in")
    @ApiResponse(responseCode = "404", description = "No such report (code report_not_found)")
    public JsonNode snapshot(@PathVariable String reportId) {
        if (!feedbackReportRepository.existsById(reportId)) {
            throw notFound();
        }
        return feedbackReportRepository.findSnapshotById(reportId)
                .<JsonNode>map(JSON::readTree)
                .filter(JsonNode::isObject)
                .orElse(tools.jackson.databind.node.NullNode.getInstance());
    }

    @DeleteMapping("/admin/feedback-reports/{reportId}/snapshot")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @Operation(summary = "Clear a report's snapshot",
            description = "GDPR hygiene: drops just the snapshot once a report is resolved, keeping "
                    + "the message thread for reference.")
    @ApiResponse(responseCode = "204", description = "Cleared")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "403", description = "Not an ADMIN with a 2FA-verified sign-in")
    @ApiResponse(responseCode = "404", description = "No such report (code report_not_found)")
    public void clearSnapshot(@PathVariable String reportId) {
        if (feedbackReportRepository.clearSnapshot(reportId) == 0) {
            throw notFound();
        }
    }

    @DeleteMapping("/admin/feedback-reports/{reportId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @Operation(summary = "Delete a report")
    @ApiResponse(responseCode = "204", description = "Deleted")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "403", description = "Not an ADMIN with a 2FA-verified sign-in")
    @ApiResponse(responseCode = "404", description = "No such report (code report_not_found)")
    public void delete(@PathVariable String reportId) {
        if (!feedbackReportRepository.existsById(reportId)) {
            throw notFound();
        }
        feedbackReportRepository.deleteById(reportId);
    }

    private static AccountFlowException notFound() {
        return new AccountFlowException(HttpStatus.NOT_FOUND, "report_not_found", "Not Found");
    }
}
