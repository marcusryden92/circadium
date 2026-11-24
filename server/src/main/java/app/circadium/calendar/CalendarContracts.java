package app.circadium.calendar;

import app.circadium.persistence.enums.EventType;
import app.circadium.persistence.enums.PlannerType;
import app.circadium.persistence.enums.TransportMode;
import com.fasterxml.jackson.annotation.JsonRawValue;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import tools.jackson.core.JsonParser;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * The calendar's wire shapes, mirroring {@code client/shared/src/contracts} ({@code models.ts}, {@code wire.ts})
 * field for field. Every key is always present, {@code null} where the TS type allows it, because the client's sync
 * diff compares whole rows and Prisma, the other backend these shapes come from, never leaves a column out. Enum
 * values are the database labels (lowercase {@code task}, uppercase {@code DRIVING}), the tokens the client compares
 * against. Dates the calendar tables hold as text stay the exact strings the client wrote.
 *
 * <p>The row records travel both ways: out in {@link BootstrapPayload}, back in through {@link DatabaseChanges}.
 * Validation covers what the database cannot check usefully (ids, the weekday range); a {@code null} in another
 * required column fails on the column's constraint instead.
 */
public final class CalendarContracts {

    private CalendarContracts() {
    }

    /** JavaScript's toISOString() shape (the timestamp wire contract): three fractional digits + Z. */
    static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    static String iso(Instant instant) {
        return instant == null ? null : ISO_MILLIS.format(instant);
    }

    /** One optimistic-concurrency sync: the client's diff against the state it last confirmed. */
    public record SyncRequest(
            @NotNull @Valid DatabaseChanges changes,
            @Schema(description = "The dataVersion the diff was computed against.")
            @NotNull @PositiveOrZero Integer clientKnownDataVersion) {
    }

    /** The sync was applied; the client confirms its sent state as the new baseline. */
    public record SyncResult(
            @Schema(description = "The account's sync counter after this sync; unchanged when the diff was empty.")
            int newDataVersion) {
    }

    /** The client's create/update/destroy diff, one group per synced table. */
    public record DatabaseChanges(
            @NotNull @Valid ChangeGroup<Planner> planner,
            @NotNull @Valid ChangeGroup<SimpleEventRow> calendar,
            @NotNull @Valid ChangeGroup<EventTemplate> template,
            @NotNull @Valid ChangeGroup<EventExtendedProps> extendedProps,
            @NotNull @Valid ChangeGroup<CategoryRow> category,
            @NotNull @Valid ChangeGroup<CategoryTimeWindow> categoryTimeWindow,
            @NotNull @Valid ChangeGroup<CategoryEvent> categoryEvent,
            @NotNull @Valid ChangeGroup<TravelEvent> travelEvent,
            @NotNull @Valid ChangeGroup<EngineMessage> engineMessage,
            @NotNull @Valid ChangeGroup<QueueRow> queue,
            @NotNull @Valid ChangeGroup<QueueMember> queueMember,
            @NotNull @Valid ChangeGroup<PlannerDependency> dependency,
            @NotNull @Valid ChangeGroup<SerializedLocation> location,
            @NotNull @Valid ChangeGroup<SerializedTravelTime> travelTime) {
    }

    public record ChangeGroup<T>(
            @NotNull List<@NotNull @Valid T> create,
            @NotNull List<@NotNull @Valid T> update,
            @NotNull List<@NotNull @Valid T> destroy) {
    }

    /** {@code Omit<SimpleEvent, "extendedProps">}: an event's own row. Its extended props sync as their own group. */
    public record SimpleEventRow(
            @NotNull String id,
            String title,
            String start,
            String end,
            Integer duration,
            String userId,
            String rrule,
            String backgroundColor,
            String borderColor,
            String createdAt,
            String updatedAt) {
    }

    /** {@code Category} without its {@code timeSlots}, which sync as {@code categoryTimeWindow}. */
    public record CategoryRow(
            @NotNull String id,
            String name,
            String icon,
            String color,
            int sortOrder,
            boolean useTimeWindows,
            boolean isStrict,
            boolean confineToOwnWindows,
            String locationId,
            String parentId,
            String userId,
            String createdAt,
            String updatedAt) {
    }

    /** {@code Queue} without its {@code members}, which sync as {@code queueMember}. */
    public record QueueRow(
            @NotNull String id,
            String title,
            int sortOrder,
            String color,
            String categoryId,
            String userId,
            String createdAt,
            String updatedAt) {
    }

    /** Everything the client needs to stand up, and to start over from after a stale sync. */
    public record BootstrapPayload(
            @Schema(description = "The account's sync counter, read in the same snapshot as the rows; "
                    + "the client sends it back with its next sync.")
            int dataVersion,
            List<Planner> planner,
            List<SimpleEvent> calendar,
            List<EventTemplate> template,
            List<Category> categories,
            List<CategoryEvent> categoryEvents,
            List<TravelEvent> travelEvents,
            List<EngineMessage> engineMessages,
            List<Queue> queues,
            List<PlannerDependency> dependencies,
            @Schema(description = "Oldest first.")
            List<SerializedLocation> locations,
            List<SerializedTravelTime> travelTimes,
            SchedulingPreferences schedulingPreferences) {
    }

    /**
     * The account-wide scheduling preferences, read with the bootstrap and written through
     * {@code PATCH /scheduling/preferences} — outside the sync diff, so changing them never moves
     * {@code dataVersion}.
     */
    public record SchedulingPreferences(
            int bufferTimeMinutes,
            TransportMode defaultTransportMode,
            @Schema(description = "0 = Sunday through 6 = Saturday.")
            int weekStartDay) {
    }

    /**
     * One completed occurrence of a recurring task/goal leaf, or one checked-off plan occurrence.
     * Kept outside the sync diff (the row is a log entry, not calendar fabric); {@code start}/{@code end}
     * stay the strings the client wrote, like the calendar tables' domain datetimes.
     */
    public record OccurrenceCompletion(
            @NotNull String id,
            String plannerId,
            String userId,
            String occurrenceKey,
            String start,
            String end,
            String createdAt) {
    }

    public record Planner(
            @NotNull String id,
            String title,
            String parentId,
            PlannerType plannerType,
            Boolean isReady,
            boolean isTriaged,
            int duration,
            String deadline,
            String starts,
            String recurrence,
            String recurrenceExceptions,
            String splitting,
            String completedSegments,
            Integer maxMinutesPerDay,
            String earliestStartDate,
            String allowedTimes,
            String linkedItemId,
            String notes,
            double sortOrder,
            String completedStartTime,
            String completedEndTime,
            int priority,
            String userId,
            String color,
            String locationId,
            boolean useParentLocation,
            String categoryId,
            String createdAt,
            String updatedAt) {
    }

    public record SimpleEvent(
            @NotNull String id,
            String title,
            String start,
            String end,
            Integer duration,
            String userId,
            String rrule,
            String backgroundColor,
            String borderColor,
            String createdAt,
            String updatedAt,
            EventExtendedProps extendedProps) {
    }

    public record EventExtendedProps(
            @NotNull String id,
            PlannerType plannerType,
            EventType eventType,
            String completedStartTime,
            String completedEndTime,
            String parentId,
            String eventId,
            @Schema(description = "Absent counts as false: the engine's event builders leave the trespass flags "
                    + "unset, and the regen that owns them stamps them later.")
            Boolean trespassingStart,
            @Schema(description = "As trespassingStart.")
            Boolean trespassingEnd) {
    }

    public record EventTemplate(
            @NotNull String id,
            String title,
            @Schema(description = "0 = Sunday through 6 = Saturday.")
            @Min(0) @Max(6) int startDay,
            String startTime,
            String userId,
            int duration,
            String color,
            String locationId,
            String recurrenceExceptions,
            String createdAt,
            String updatedAt) {
    }

    public record Category(
            @NotNull String id,
            String name,
            String icon,
            String color,
            int sortOrder,
            boolean useTimeWindows,
            boolean isStrict,
            boolean confineToOwnWindows,
            String locationId,
            String parentId,
            String userId,
            String createdAt,
            String updatedAt,
            List<CategoryTimeWindow> timeSlots) {
    }

    public record CategoryTimeWindow(
            @NotNull String id,
            @Schema(description = "0 = Sunday through 6 = Saturday.")
            @Min(0) @Max(6) int day,
            String startTime,
            String endTime,
            String recurrenceExceptions,
            String categoryId,
            String userId) {
    }

    public record CategoryEvent(
            @NotNull String id,
            String start,
            String end,
            boolean trespassingStart,
            boolean trespassingEnd,
            String categoryTimeWindowId,
            String categoryId,
            String userId,
            String createdAt,
            String updatedAt) {
    }

    public record TravelEvent(
            @NotNull String id,
            String start,
            String end,
            String fromLocationId,
            String toLocationId,
            int travelMinutes,
            Integer requiredTravelMinutes,
            boolean insufficientTravel,
            boolean overconstrained,
            String userId,
            String createdAt,
            String updatedAt) {
    }

    public record EngineMessage(
            @NotNull String id,
            String type,
            String tone,
            @Schema(description = "Any JSON value, passed through as stored.", implementation = Object.class)
            @JsonRawValue
            @JsonDeserialize(using = RawJsonDeserializer.class)
            String payload,
            boolean dismissed,
            String userId,
            String createdAt,
            String updatedAt) {
    }

    public record Queue(
            @NotNull String id,
            String title,
            int sortOrder,
            String color,
            String categoryId,
            String userId,
            String createdAt,
            String updatedAt,
            List<QueueMember> members) {
    }

    public record QueueMember(
            @NotNull String id,
            double sortOrder,
            String queueId,
            String plannerId,
            String userId,
            String createdAt,
            String updatedAt) {
    }

    public record PlannerDependency(
            @NotNull String id,
            String predecessorId,
            String successorId,
            String userId,
            String createdAt,
            String updatedAt) {
    }

    public record SerializedLocation(
            @NotNull String id,
            String name,
            String address,
            String placeId) {
    }

    public record SerializedTravelTime(
            @NotNull String id,
            String fromLocationId,
            String toLocationId,
            TransportMode transportMode,
            int googleRushHourMinutes,
            int googleRegularMinutes,
            int googleNightMinutes,
            Integer customRushHourMinutes,
            Integer customRegularMinutes,
            Integer customNightMinutes,
            @Schema(description = "Google found no route between the two locations.")
            boolean unroutable) {
    }

    /**
     * Reads any JSON value into its JSON text, the counterpart of {@link JsonRawValue} on the way out, so a payload
     * reaches the {@code jsonb} column as the value the client sent. A JSON {@code null} stays the JSON literal, as
     * the web's {@code JSON.stringify} writes it.
     */
    static final class RawJsonDeserializer extends ValueDeserializer<String> {

        @Override
        public String deserialize(JsonParser parser, DeserializationContext context) {
            return context.readTree(parser).toString();
        }

        @Override
        public String getNullValue(DeserializationContext context) {
            return "null";
        }
    }
}
