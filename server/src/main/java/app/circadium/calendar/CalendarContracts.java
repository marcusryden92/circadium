package app.circadium.calendar;

import app.circadium.persistence.enums.EventType;
import app.circadium.persistence.enums.PlannerType;
import app.circadium.persistence.enums.TransportMode;
import com.fasterxml.jackson.annotation.JsonRawValue;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * The calendar's wire shapes, mirroring {@code client/shared/src/contracts} ({@code models.ts}, {@code wire.ts})
 * field for field. Every key is always present, {@code null} where the TS type allows it, because the client's sync
 * diff compares whole rows and Prisma, the other backend these shapes come from, never leaves a column out. Enum
 * values are the database labels (lowercase {@code task}, uppercase {@code DRIVING}), the tokens the client compares
 * against. Dates the calendar tables hold as text stay the exact strings the client wrote.
 */
public final class CalendarContracts {

    private CalendarContracts() {
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
            List<SerializedTravelTime> travelTimes) {
    }

    public record Planner(
            String id,
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
            String id,
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
            String id,
            PlannerType plannerType,
            EventType eventType,
            String completedStartTime,
            String completedEndTime,
            String parentId,
            String eventId,
            boolean trespassingStart,
            boolean trespassingEnd) {
    }

    public record EventTemplate(
            String id,
            String title,
            @Schema(description = "0 = Sunday through 6 = Saturday.")
            int startDay,
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
            String id,
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
            String id,
            @Schema(description = "0 = Sunday through 6 = Saturday.")
            int day,
            String startTime,
            String endTime,
            String recurrenceExceptions,
            String categoryId,
            String userId) {
    }

    public record CategoryEvent(
            String id,
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
            String id,
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
            String id,
            String type,
            String tone,
            @Schema(description = "Any JSON value, passed through as stored.", implementation = Object.class)
            @JsonRawValue
            String payload,
            boolean dismissed,
            String userId,
            String createdAt,
            String updatedAt) {
    }

    public record Queue(
            String id,
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
            String id,
            double sortOrder,
            String queueId,
            String plannerId,
            String userId,
            String createdAt,
            String updatedAt) {
    }

    public record PlannerDependency(
            String id,
            String predecessorId,
            String successorId,
            String userId,
            String createdAt,
            String updatedAt) {
    }

    public record SerializedLocation(
            String id,
            String name,
            String address,
            String placeId) {
    }

    public record SerializedTravelTime(
            String id,
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
}
