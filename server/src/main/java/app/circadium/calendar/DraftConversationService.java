package app.circadium.calendar;

import app.circadium.auth.AccountFlowException;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.DraftConversation;
import app.circadium.persistence.repository.DraftConversationRepository;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * AI-assistant chat history, ported from {@code actions/draftConversations.ts}: conversations are
 * read and written wholesale (the messages column is the entire ordered array), capped at 50 per
 * user, and are NOT part of the calendar diff sync — nothing here moves {@code users.dataVersion}.
 * The messages column is schemaless by design: the lenient sanitizer runs on BOTH read and write,
 * so a future message-shape change needs no migration, just a wider parser here.
 */
@Service
@RequiredArgsConstructor
public class DraftConversationService {

    private static final int MAX_CONVERSATIONS = 50;
    private static final int MAX_MESSAGES = 200;
    private static final int MAX_MESSAGE_CHARS = 20_000;
    private static final int MAX_TOOL_NOTE_CHARS = 1_000;
    private static final int MAX_TITLE_CHARS = 80;
    private static final int MAX_ID_CHARS = 64;

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final DraftConversationRepository repository;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public record Summary(String id, String title, Instant updatedAt) {
    }

    public record Message(String id, String role, String content,
            @JsonInclude(JsonInclude.Include.NON_NULL) String toolNote) {
    }

    public record Payload(String id, String title, Instant updatedAt, List<Message> messages) {
    }

    @Transactional(readOnly = true)
    public List<Summary> list(String userId) {
        return repository.findByUserIdOrderByUpdatedAtDesc(userId, PageRequest.of(0, MAX_CONVERSATIONS))
                .stream()
                .map(row -> new Summary(row.getId(), row.getTitle(), row.getUpdatedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public Payload get(String userId, String id) {
        DraftConversation row = repository.findByIdAndUserId(id, userId)
                .orElseThrow(DraftConversationService::notFound);
        return new Payload(row.getId(), row.getTitle(), row.getUpdatedAt(), sanitize(parse(row.getMessages())));
    }

    @Transactional
    public void upsert(String userId, String rawId, String rawTitle, JsonNode rawMessages) {
        String id = rawId == null ? "" : JsText.trim(rawId);
        if (id.isEmpty() || id.length() > MAX_ID_CHARS) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "invalid_conversation_id",
                    "Invalid conversation id");
        }
        List<Message> messages = sanitize(rawMessages);
        if (messages.isEmpty()) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "nothing_to_save", "Nothing to save");
        }
        String title = truncate(rawTitle == null ? "" : JsText.trim(rawTitle), MAX_TITLE_CHARS);
        if (title.isEmpty()) {
            title = "Untitled";
        }

        // The id is client-minted, so an upsert keyed on it must not be allowed to update
        // another user's row.
        Optional<DraftConversation> existing = repository.findById(id);
        if (existing.isPresent() && !existing.get().getUserId().equals(userId)) {
            throw notFound();
        }

        Instant now = DbTime.now(clock);
        DraftConversation row = existing.orElseGet(() -> {
            DraftConversation created = new DraftConversation();
            created.setId(id);
            created.setUserId(userId);
            created.setCreatedAt(now);
            return created;
        });
        row.setTitle(title);
        row.setMessages(JSON.writeValueAsString(messages));
        row.setUpdatedAt(now);
        // Flushed, not just saved: the cap trim below runs as plain SQL in the same transaction
        // and must see this row, or a 51st conversation survives.
        repository.saveAndFlush(row);

        jdbcTemplate.update("DELETE FROM \"DraftConversations\" WHERE \"userId\" = ? AND \"id\" NOT IN ("
                + "SELECT \"id\" FROM \"DraftConversations\" WHERE \"userId\" = ?"
                + " ORDER BY \"updatedAt\" DESC LIMIT " + MAX_CONVERSATIONS + ")", userId, userId);
    }

    @Transactional
    public void delete(String userId, String id) {
        repository.deleteByIdAndUserId(id, userId);
    }

    private static AccountFlowException notFound() {
        return new AccountFlowException(HttpStatus.NOT_FOUND, "conversation_not_found", "Not Found");
    }

    private static JsonNode parse(String messages) {
        try {
            return JSON.readTree(messages);
        } catch (RuntimeException e) {
            return JSON.createArrayNode();
        }
    }

    private static List<Message> sanitize(JsonNode raw) {
        List<Message> messages = new ArrayList<>();
        if (raw == null || !raw.isArray()) {
            return messages;
        }
        for (JsonNode entry : raw) {
            if (!entry.isObject()) {
                continue;
            }
            String id = stringField(entry, "id");
            if (id == null || id.isEmpty()) {
                continue;
            }
            String role = stringField(entry, "role");
            if (!"user".equals(role) && !"assistant".equals(role)) {
                continue;
            }
            String content = stringField(entry, "content");
            if (content == null || JsText.isBlank(content)) {
                continue;
            }
            String toolNote = stringField(entry, "toolNote");
            messages.add(new Message(id, role, truncate(content, MAX_MESSAGE_CHARS),
                    toolNote == null || JsText.isBlank(toolNote) ? null
                            : truncate(toolNote, MAX_TOOL_NOTE_CHARS)));
            if (messages.size() >= MAX_MESSAGES) {
                break;
            }
        }
        return messages;
    }

    private static String stringField(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isString() ? value.stringValue() : null;
    }

    private static String truncate(String value, int maxChars) {
        return value.length() <= maxChars ? value : value.substring(0, maxChars);
    }
}
