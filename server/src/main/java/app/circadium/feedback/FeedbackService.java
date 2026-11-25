package app.circadium.feedback;

import app.circadium.account.DataExportService;
import app.circadium.auth.AccountFlowException;
import app.circadium.calendar.JsText;
import app.circadium.external.mail.AccountMailer;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.FeedbackReport;
import app.circadium.persistence.entity.Suggestion;
import app.circadium.persistence.entity.SuggestionVote;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.FeedbackReportRepository;
import app.circadium.persistence.repository.SuggestionRepository;
import app.circadium.persistence.repository.SuggestionVoteRepository;
import app.circadium.persistence.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Support messages + the suggestion wall, ported from {@code actions/feedback.ts}. The report row is
 * the source of truth; the support-inbox notification is queued asynchronously and a delivery failure
 * never fails the action. The error strings are the retired action's, verbatim — the client surfaces
 * them as-is.
 */
@Service
@RequiredArgsConstructor
public class FeedbackService {

    private static final int MAX_SUGGESTIONS_PER_USER = 25;
    private static final int MAX_SUGGESTIONS_LISTED = 300;
    private static final int MIN_MESSAGE_CHARS = 10;
    private static final int MAX_MESSAGE_CHARS = 5000;
    private static final int MIN_TITLE_CHARS = 3;
    private static final int MAX_TITLE_CHARS = 120;
    private static final int MAX_BODY_CHARS = 2000;

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final FeedbackReportRepository feedbackReportRepository;
    private final SuggestionRepository suggestionRepository;
    private final SuggestionVoteRepository suggestionVoteRepository;
    private final UserRepository userRepository;
    private final DataExportService dataExportService;
    private final AccountMailer accountMailer;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public record SupportMessageResult(String reportId) {}

    public record SuggestionView(String id, String title, String body, String authorName, boolean isMine,
            int score, int upvotes, int downvotes, int myVote, Instant createdAt) {}

    public SupportMessageResult sendSupportMessage(String userId, String rawMessage, boolean includeSnapshot) {
        String message = rawMessage == null ? "" : JsText.trim(rawMessage);
        if (message.length() < MIN_MESSAGE_CHARS) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_message",
                    "Tell us a bit more — at least 10 characters.");
        }
        if (message.length() > MAX_MESSAGE_CHARS) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_message",
                    "Maximum 5000 characters.");
        }

        String snapshot = null;
        if (includeSnapshot) {
            try {
                snapshot = JSON.writeValueAsString(dataExportService.export(userId));
            } catch (RuntimeException e) {
                throw new AccountFlowException(HttpStatus.INTERNAL_SERVER_ERROR, "snapshot_failed",
                        "Could not capture your data snapshot — try again, or send without it.");
            }
        }

        FeedbackReport report = new FeedbackReport();
        report.setId(UUID.randomUUID().toString());
        report.setMessage(message);
        report.setDataSnapshot(snapshot);
        report.setUserId(userId);
        report.setCreatedAt(DbTime.now(clock));
        feedbackReportRepository.save(report);

        // Queued on the mailer's background pool; the admin view lists every report regardless of
        // whether this notification ever arrives.
        User user = userRepository.findById(userId).orElse(null);
        accountMailer.sendFeedbackNotification(report.getId(), user == null ? null : user.getName(),
                user == null || user.getEmail() == null ? "unknown" : user.getEmail(), message,
                includeSnapshot);

        return new SupportMessageResult(report.getId());
    }

    @Transactional(readOnly = true)
    public List<SuggestionView> getSuggestions(String userId) {
        List<Suggestion> rows = suggestionRepository.findAllByOrderByCreatedAtDesc(
                PageRequest.of(0, MAX_SUGGESTIONS_LISTED));
        List<String> ids = rows.stream().map(Suggestion::getId).toList();
        Map<String, List<SuggestionVote>> votes = new HashMap<>();
        if (!ids.isEmpty()) {
            for (SuggestionVote vote : suggestionVoteRepository.findBySuggestionIdIn(ids)) {
                votes.computeIfAbsent(vote.getSuggestionId(), k -> new java.util.ArrayList<>()).add(vote);
            }
        }
        Map<String, String> authorNames = authorNames(rows);
        return rows.stream()
                .map(row -> view(row, votes.getOrDefault(row.getId(), List.of()),
                        authorNames.get(row.getUserId()), userId))
                .toList();
    }

    @Transactional
    public SuggestionView createSuggestion(String userId, String rawTitle, String rawBody) {
        String title = rawTitle == null ? "" : JsText.trim(rawTitle);
        if (title.length() < MIN_TITLE_CHARS) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_suggestion",
                    "Give the suggestion a short title.");
        }
        if (title.length() > MAX_TITLE_CHARS) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_suggestion",
                    "Maximum 120 characters.");
        }
        String body = rawBody == null ? "" : JsText.trim(rawBody);
        if (body.length() > MAX_BODY_CHARS) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_suggestion",
                    "Maximum 2000 characters.");
        }

        if (suggestionRepository.countByUserId(userId) >= MAX_SUGGESTIONS_PER_USER) {
            throw new AccountFlowException(HttpStatus.CONFLICT, "suggestion_limit",
                    "You have reached the suggestion limit — delete one of yours to post a new one.");
        }

        Instant now = DbTime.now(clock);
        Suggestion suggestion = new Suggestion();
        suggestion.setId(UUID.randomUUID().toString());
        suggestion.setTitle(title);
        suggestion.setBody(body.isEmpty() ? null : body);
        suggestion.setUserId(userId);
        suggestion.setCreatedAt(now);
        suggestionRepository.save(suggestion);

        // The author's own upvote rides the create, like the retired action's nested vote create.
        SuggestionVote vote = new SuggestionVote();
        vote.setId(UUID.randomUUID().toString());
        vote.setSuggestionId(suggestion.getId());
        vote.setUserId(userId);
        vote.setValue(1);
        vote.setCreatedAt(now);
        suggestionVoteRepository.save(vote);

        User author = userRepository.findById(userId).orElse(null);
        return view(suggestion, List.of(vote), author == null ? null : author.getName(), userId);
    }

    @Transactional
    public void vote(String userId, String suggestionId, int value) {
        if (value != 1 && value != -1 && value != 0) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_vote", "Invalid vote");
        }
        if (value == 0) {
            suggestionVoteRepository.deleteBySuggestionIdAndUserId(suggestionId, userId);
            return;
        }
        Optional<SuggestionVote> existing =
                suggestionVoteRepository.findBySuggestionIdAndUserId(suggestionId, userId);
        SuggestionVote vote = existing.orElseGet(() -> {
            SuggestionVote created = new SuggestionVote();
            created.setId(UUID.randomUUID().toString());
            created.setSuggestionId(suggestionId);
            created.setUserId(userId);
            created.setCreatedAt(DbTime.now(clock));
            return created;
        });
        vote.setValue(value);
        try {
            suggestionVoteRepository.save(vote);
            suggestionVoteRepository.flush();
        } catch (DataIntegrityViolationException e) {
            // The retired action surfaced a raw foreign-key error for a vote on a deleted suggestion;
            // a clean 404 is the one deliberate deviation here.
            throw new AccountFlowException(HttpStatus.NOT_FOUND, "suggestion_not_found", "Not Found");
        }
    }

    /** Admins (checked by the caller) may delete anyone's suggestion; a missing id is a no-op. */
    @Transactional
    public void deleteSuggestion(String userId, String suggestionId, boolean admin) {
        if (admin) {
            suggestionRepository.deleteById(suggestionId);
        } else {
            suggestionRepository.deleteByIdAndUserId(suggestionId, userId);
        }
    }

    private Map<String, String> authorNames(List<Suggestion> rows) {
        String[] userIds = rows.stream().map(Suggestion::getUserId).distinct().toArray(String[]::new);
        Map<String, String> names = new HashMap<>();
        if (userIds.length == 0) {
            return names;
        }
        jdbcTemplate.query(connection -> {
            var statement = connection.prepareStatement(
                    "SELECT \"id\", \"name\" FROM \"users\" WHERE \"id\" = ANY (?)");
            statement.setArray(1, connection.createArrayOf("text", userIds));
            return statement;
        }, rs -> { names.put(rs.getString("id"), rs.getString("name")); });
        return names;
    }

    private static SuggestionView view(Suggestion row, List<SuggestionVote> votes, String authorName,
            String currentUserId) {
        int upvotes = 0;
        int downvotes = 0;
        int myVote = 0;
        for (SuggestionVote vote : votes) {
            if (vote.getValue() > 0) {
                upvotes++;
            } else if (vote.getValue() < 0) {
                downvotes++;
            }
            if (vote.getUserId().equals(currentUserId)) {
                myVote = Integer.signum(vote.getValue());
            }
        }
        return new SuggestionView(row.getId(), row.getTitle(), row.getBody(),
                authorName == null ? "Anonymous" : authorName, row.getUserId().equals(currentUserId),
                upvotes - downvotes, upvotes, downvotes, myVote, row.getCreatedAt());
    }
}
