package app.circadium.sync;

import static app.circadium.sync.BulkStatements.Column.bool;
import static app.circadium.sync.BulkStatements.Column.float8;
import static app.circadium.sync.BulkStatements.Column.int4;
import static app.circadium.sync.BulkStatements.Column.jsonb;
import static app.circadium.sync.BulkStatements.Column.label;
import static app.circadium.sync.BulkStatements.Column.text;

import app.circadium.calendar.CalendarContracts.CategoryEvent;
import app.circadium.calendar.CalendarContracts.CategoryRow;
import app.circadium.calendar.CalendarContracts.CategoryTimeWindow;
import app.circadium.calendar.CalendarContracts.ChangeGroup;
import app.circadium.calendar.CalendarContracts.DatabaseChanges;
import app.circadium.calendar.CalendarContracts.EngineMessage;
import app.circadium.calendar.CalendarContracts.EventExtendedProps;
import app.circadium.calendar.CalendarContracts.EventTemplate;
import app.circadium.calendar.CalendarContracts.Planner;
import app.circadium.calendar.CalendarContracts.PlannerDependency;
import app.circadium.calendar.CalendarContracts.QueueMember;
import app.circadium.calendar.CalendarContracts.QueueRow;
import app.circadium.calendar.CalendarContracts.SerializedLocation;
import app.circadium.calendar.CalendarContracts.SerializedTravelTime;
import app.circadium.calendar.CalendarContracts.SimpleEventRow;
import app.circadium.calendar.CalendarContracts.TravelEvent;
import app.circadium.persistence.enums.WeekDayType;
import app.circadium.sync.BulkStatements.Column;
import app.circadium.sync.BulkStatements.OwnedReference;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Writes a {@link DatabaseChanges} to the tables, as the web's {@code sync-handlers} do. Must run inside the sync's
 * transaction, after its version check.
 *
 * <p>Tables are written in foreign-key order, so a row exists before a row that references it: Location, Category
 * and Planner (an assistant save can file a new goal under a category it creates in the same sync), then the event
 * tables (an event before its extended props), then the precedence tables (a queue before its members). Deletes
 * ride the same order and the schema's cascade and set-null rules. Creates skip a row whose id already exists,
 * except in the engine-output tables, where a duplicate means a broken diff and fails the sync.
 *
 * <p>{@code updatedAt} is the server's sync time on every update and on the engine-output creates; other creates
 * keep the client's timestamps. Engine-output {@code createdAt} is left to the column default.
 */
@Component
@RequiredArgsConstructor
class CalendarChangeWriter {

    private static final String SKIP_DUPLICATES = "ON CONFLICT DO NOTHING";
    private static final String PLAIN = "";

    private final BulkStatements statements;

    void write(String userId, DatabaseChanges changes, String now) {
        locations(userId, changes.location());
        categories(userId, changes.category(), now);
        planners(userId, changes.planner(), now);
        calendar(userId, changes.calendar(), now);
        extendedProps(userId, changes.extendedProps());
        templates(userId, changes.template(), now);
        timeWindows(userId, changes.categoryTimeWindow());
        categoryEvents(userId, changes.categoryEvent(), now);
        travelEvents(userId, changes.travelEvent(), now);
        engineMessages(userId, changes.engineMessage(), now);
        queues(userId, changes.queue(), now);
        queueMembers(userId, changes.queueMember(), now);
        dependencies(userId, changes.dependency());
        travelTimes(userId, changes.travelTime());
    }

    /** Creating a location needs a Google Places lookup, so it is not a sync operation; only renames and deletes. */
    private void locations(String userId, ChangeGroup<SerializedLocation> group) {
        statements.updateOwned("Locations", group.update(), SerializedLocation::id,
                List.of(text("name", SerializedLocation::name)), userId, null, List.of());
        statements.deleteOwned("Locations", ids(group.destroy(), SerializedLocation::id), userId);
    }

    private void categories(String userId, ChangeGroup<CategoryRow> group, String now) {
        List<Column<CategoryRow>> content = List.of(
                text("name", CategoryRow::name),
                text("icon", CategoryRow::icon),
                text("color", CategoryRow::color),
                int4("sortOrder", CategoryRow::sortOrder),
                bool("isStrict", CategoryRow::isStrict),
                bool("useTimeWindows", CategoryRow::useTimeWindows),
                bool("confineToOwnWindows", CategoryRow::confineToOwnWindows),
                text("locationId", CategoryRow::locationId),
                text("parentId", CategoryRow::parentId));
        statements.insertOwned("Categories", group.create(),
                withTimestamps(text("id", CategoryRow::id), content, CategoryRow::createdAt, CategoryRow::updatedAt),
                userId, null, List.of(), SKIP_DUPLICATES);
        statements.updateOwned("Categories", group.update(), CategoryRow::id, content, userId, now, List.of());
        statements.deleteOwned("Categories", ids(group.destroy(), CategoryRow::id), userId);
    }

    private void planners(String userId, ChangeGroup<Planner> group, String now) {
        List<Column<Planner>> content = List.of(
                text("title", Planner::title),
                text("parentId", Planner::parentId),
                label("plannerType", "PlannerType", Planner::plannerType),
                bool("isReady", Planner::isReady),
                bool("isTriaged", Planner::isTriaged),
                int4("duration", Planner::duration),
                text("deadline", Planner::deadline),
                text("starts", Planner::starts),
                text("recurrence", Planner::recurrence),
                text("recurrenceExceptions", Planner::recurrenceExceptions),
                text("splitting", Planner::splitting),
                text("completedSegments", Planner::completedSegments),
                int4("maxMinutesPerDay", Planner::maxMinutesPerDay),
                text("earliestStartDate", Planner::earliestStartDate),
                text("allowedTimes", Planner::allowedTimes),
                text("linkedItemId", Planner::linkedItemId),
                text("notes", Planner::notes),
                float8("sortOrder", Planner::sortOrder),
                text("completedStartTime", Planner::completedStartTime),
                text("completedEndTime", Planner::completedEndTime),
                int4("priority", Planner::priority),
                text("color", Planner::color),
                text("locationId", Planner::locationId),
                bool("useParentLocation", Planner::useParentLocation),
                text("categoryId", Planner::categoryId));
        statements.insertOwned("Planners", group.create(),
                withTimestamps(text("id", Planner::id), content, Planner::createdAt, Planner::updatedAt),
                userId, null, List.of(), SKIP_DUPLICATES);
        statements.updateOwned("Planners", group.update(), Planner::id, content, userId, now, List.of());
        statements.deleteOwned("Planners", ids(group.destroy(), Planner::id), userId);
    }

    private void calendar(String userId, ChangeGroup<SimpleEventRow> group, String now) {
        List<Column<SimpleEventRow>> content = List.of(
                text("title", SimpleEventRow::title),
                text("start", SimpleEventRow::start),
                text("end", SimpleEventRow::end),
                int4("duration", SimpleEventRow::duration),
                text("rrule", SimpleEventRow::rrule),
                text("backgroundColor", SimpleEventRow::backgroundColor),
                text("borderColor", SimpleEventRow::borderColor));
        statements.insertOwned("SimpleEvents", group.create(),
                withTimestamps(text("id", SimpleEventRow::id), content, SimpleEventRow::createdAt,
                        SimpleEventRow::updatedAt),
                userId, null, List.of(), SKIP_DUPLICATES);
        statements.updateOwned("SimpleEvents", group.update(), SimpleEventRow::id, content, userId, now, List.of());
        statements.deleteOwned("SimpleEvents", ids(group.destroy(), SimpleEventRow::id), userId);
    }

    /**
     * Extended props have no owner column; ownership is the parent event's. An update is an upsert on
     * {@code eventId} (the engine may hand an event a props row it lacked), and it never changes {@code eventType},
     * which is fixed when the row is created. Missing trespass flags are written as false, the columns' default.
     */
    private void extendedProps(String userId, ChangeGroup<EventExtendedProps> group) {
        List<Column<EventExtendedProps>> columns = List.of(
                text("id", EventExtendedProps::id),
                text("eventId", EventExtendedProps::eventId),
                label("plannerType", "PlannerType", EventExtendedProps::plannerType),
                label("eventType", "EventType", EventExtendedProps::eventType),
                text("parentId", EventExtendedProps::parentId),
                text("completedStartTime", EventExtendedProps::completedStartTime),
                text("completedEndTime", EventExtendedProps::completedEndTime),
                bool("trespassingStart", props -> Boolean.TRUE.equals(props.trespassingStart())),
                bool("trespassingEnd", props -> Boolean.TRUE.equals(props.trespassingEnd())));
        statements.insertThroughParent("EventExtendedProps", group.create(), columns, "eventId", "SimpleEvents",
                userId, SKIP_DUPLICATES);
        statements.insertThroughParent("EventExtendedProps", group.update(), columns, "eventId", "SimpleEvents",
                userId, """
                        ON CONFLICT ("eventId") DO UPDATE SET
                            "plannerType" = EXCLUDED."plannerType",
                            "parentId" = EXCLUDED."parentId",
                            "completedStartTime" = EXCLUDED."completedStartTime",
                            "completedEndTime" = EXCLUDED."completedEndTime",
                            "trespassingStart" = EXCLUDED."trespassingStart",
                            "trespassingEnd" = EXCLUDED."trespassingEnd"
                        """);
        statements.deleteThroughParent("EventExtendedProps", ids(group.destroy(), EventExtendedProps::id), "eventId",
                "SimpleEvents", userId);
    }

    /** Templates carry the weekday as 0-6 on the wire and as the {@code WeekDayType} label in the table. */
    private void templates(String userId, ChangeGroup<EventTemplate> group, String now) {
        List<Column<EventTemplate>> content = List.of(
                text("title", EventTemplate::title),
                label("startDay", "WeekDayType", template -> WeekDayType.values()[template.startDay()]),
                text("startTime", EventTemplate::startTime),
                int4("duration", EventTemplate::duration),
                text("color", EventTemplate::color),
                text("locationId", EventTemplate::locationId),
                text("recurrenceExceptions", EventTemplate::recurrenceExceptions));
        statements.insertOwned("EventTemplates", group.create(),
                withTimestamps(text("id", EventTemplate::id), content, EventTemplate::createdAt,
                        EventTemplate::updatedAt),
                userId, null, List.of(), SKIP_DUPLICATES);
        statements.updateOwned("EventTemplates", group.update(), EventTemplate::id, content, userId, now, List.of());
        statements.deleteOwned("EventTemplates", ids(group.destroy(), EventTemplate::id), userId);
    }

    /**
     * A window is read back through its category, so its {@code categoryId} must be one of the caller's categories:
     * otherwise a window could be planted in another account's category.
     */
    private void timeWindows(String userId, ChangeGroup<CategoryTimeWindow> group) {
        List<Column<CategoryTimeWindow>> content = List.of(
                int4("day", CategoryTimeWindow::day),
                text("startTime", CategoryTimeWindow::startTime),
                text("endTime", CategoryTimeWindow::endTime),
                text("recurrenceExceptions", CategoryTimeWindow::recurrenceExceptions),
                text("categoryId", CategoryTimeWindow::categoryId));
        List<OwnedReference> references = List.of(new OwnedReference("categoryId", "Categories"));
        statements.insertOwned("CategoryTimeWindows", group.create(),
                prepend(text("id", CategoryTimeWindow::id), content), userId, null, references, SKIP_DUPLICATES);
        statements.updateOwned("CategoryTimeWindows", group.update(), CategoryTimeWindow::id, content, userId, null,
                references);
        statements.deleteOwned("CategoryTimeWindows", ids(group.destroy(), CategoryTimeWindow::id), userId);
    }

    /**
     * Engine output, rewritten on every regen. An update is a delete and a re-insert at the same id, two statements
     * however many rows changed.
     */
    private void categoryEvents(String userId, ChangeGroup<CategoryEvent> group, String now) {
        statements.deleteOwned("CategoryEvents",
                ids(concat(group.destroy(), group.update()), CategoryEvent::id), userId);
        statements.insertOwned("CategoryEvents", concat(group.create(), group.update()), List.of(
                        text("id", CategoryEvent::id),
                        text("start", CategoryEvent::start),
                        text("end", CategoryEvent::end),
                        bool("trespassingStart", CategoryEvent::trespassingStart),
                        bool("trespassingEnd", CategoryEvent::trespassingEnd),
                        text("categoryTimeWindowId", CategoryEvent::categoryTimeWindowId),
                        text("categoryId", CategoryEvent::categoryId)),
                userId, now, List.of(), PLAIN);
    }

    /** Engine output, rewritten the same way as {@link #categoryEvents}. */
    private void travelEvents(String userId, ChangeGroup<TravelEvent> group, String now) {
        statements.deleteOwned("TravelEvents", ids(concat(group.destroy(), group.update()), TravelEvent::id), userId);
        statements.insertOwned("TravelEvents", concat(group.create(), group.update()), List.of(
                        text("id", TravelEvent::id),
                        text("start", TravelEvent::start),
                        text("end", TravelEvent::end),
                        text("fromLocationId", TravelEvent::fromLocationId),
                        text("toLocationId", TravelEvent::toLocationId),
                        int4("travelMinutes", TravelEvent::travelMinutes),
                        int4("requiredTravelMinutes", TravelEvent::requiredTravelMinutes),
                        bool("insufficientTravel", TravelEvent::insufficientTravel),
                        bool("overconstrained", TravelEvent::overconstrained)),
                userId, now, List.of(), PLAIN);
    }

    /**
     * Engine output, but updated in place: the user's {@code dismissed} flag flows through the update, and the row
     * stays so the engine can carry the flag forward on the next regen.
     */
    private void engineMessages(String userId, ChangeGroup<EngineMessage> group, String now) {
        List<Column<EngineMessage>> content = List.of(
                text("type", EngineMessage::type),
                text("tone", EngineMessage::tone),
                jsonb("payload", EngineMessage::payload),
                bool("dismissed", EngineMessage::dismissed));
        statements.deleteOwned("EngineMessages", ids(group.destroy(), EngineMessage::id), userId);
        statements.insertOwned("EngineMessages", group.create(), prepend(text("id", EngineMessage::id), content),
                userId, now, List.of(), PLAIN);
        statements.updateOwned("EngineMessages", group.update(), EngineMessage::id, content, userId, now, List.of());
    }

    private void queues(String userId, ChangeGroup<QueueRow> group, String now) {
        List<Column<QueueRow>> content = List.of(
                text("title", QueueRow::title),
                int4("sortOrder", QueueRow::sortOrder),
                text("color", QueueRow::color),
                text("categoryId", QueueRow::categoryId));
        statements.insertOwned("Queues", group.create(),
                withTimestamps(text("id", QueueRow::id), content, QueueRow::createdAt, QueueRow::updatedAt),
                userId, null, List.of(), SKIP_DUPLICATES);
        statements.updateOwned("Queues", group.update(), QueueRow::id, content, userId, now, List.of());
        statements.deleteOwned("Queues", ids(group.destroy(), QueueRow::id), userId);
    }

    /**
     * A member is read back through its queue, and {@code plannerId} is unique across the table, so both must be the
     * caller's own: otherwise a member could be planted in another account's queue, or take another account's
     * planner item out of reach of its own queues.
     */
    private void queueMembers(String userId, ChangeGroup<QueueMember> group, String now) {
        List<OwnedReference> references = List.of(
                new OwnedReference("queueId", "Queues"), new OwnedReference("plannerId", "Planners"));
        statements.insertOwned("QueueMembers", group.create(), List.of(
                        text("id", QueueMember::id),
                        float8("sortOrder", QueueMember::sortOrder),
                        text("queueId", QueueMember::queueId),
                        text("plannerId", QueueMember::plannerId),
                        text("createdAt", QueueMember::createdAt),
                        text("updatedAt", QueueMember::updatedAt)),
                userId, null, references, SKIP_DUPLICATES);
        statements.updateOwned("QueueMembers", group.update(), QueueMember::id, List.of(
                        float8("sortOrder", QueueMember::sortOrder),
                        text("queueId", QueueMember::queueId)),
                userId, now, List.of(new OwnedReference("queueId", "Queues")));
        statements.deleteOwned("QueueMembers", ids(group.destroy(), QueueMember::id), userId);
    }

    /**
     * Dependencies are immutable: created or deleted, never updated. Each (predecessor, successor) pair is unique
     * across the table, so both ends must be the caller's own planner items.
     */
    private void dependencies(String userId, ChangeGroup<PlannerDependency> group) {
        statements.insertOwned("PlannerDependencies", group.create(), List.of(
                        text("id", PlannerDependency::id),
                        text("predecessorId", PlannerDependency::predecessorId),
                        text("successorId", PlannerDependency::successorId),
                        text("createdAt", PlannerDependency::createdAt),
                        text("updatedAt", PlannerDependency::updatedAt)),
                userId, null,
                List.of(new OwnedReference("predecessorId", "Planners"), new OwnedReference("successorId", "Planners")),
                SKIP_DUPLICATES);
        statements.deleteOwned("PlannerDependencies", ids(group.destroy(), PlannerDependency::id), userId);
    }

    /**
     * Only the user's own overrides sync. Creating a travel time needs a Google route lookup, the Google minutes are
     * the server's, and travel times are deleted with their locations.
     */
    private void travelTimes(String userId, ChangeGroup<SerializedTravelTime> group) {
        statements.updateOwned("TravelTimes", group.update(), SerializedTravelTime::id, List.of(
                        int4("customRushHourMinutes", SerializedTravelTime::customRushHourMinutes),
                        int4("customRegularMinutes", SerializedTravelTime::customRegularMinutes),
                        int4("customNightMinutes", SerializedTravelTime::customNightMinutes)),
                userId, null, List.of());
    }

    private static <T> List<Column<T>> withTimestamps(Column<T> id, List<Column<T>> content,
            Function<? super T, String> createdAt, Function<? super T, String> updatedAt) {
        List<Column<T>> columns = new ArrayList<>(prepend(id, content));
        columns.add(text("createdAt", createdAt));
        columns.add(text("updatedAt", updatedAt));
        return columns;
    }

    private static <T> List<Column<T>> prepend(Column<T> id, List<Column<T>> content) {
        return Stream.concat(Stream.of(id), content.stream()).toList();
    }

    private static <T> List<T> concat(List<T> first, List<T> second) {
        return Stream.concat(first.stream(), second.stream()).toList();
    }

    private static <T> List<String> ids(List<T> rows, Function<? super T, String> id) {
        return rows.stream().map(id).toList();
    }
}
