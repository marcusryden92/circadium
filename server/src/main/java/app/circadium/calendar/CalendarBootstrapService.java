package app.circadium.calendar;

import static java.util.stream.Collectors.groupingBy;
import static java.util.stream.Collectors.mapping;
import static java.util.stream.Collectors.toList;
import static java.util.stream.Collectors.toMap;

import static app.circadium.calendar.CalendarContracts.iso;

import app.circadium.auth.AccountFlowException;
import app.circadium.calendar.CalendarContracts.BootstrapPayload;
import app.circadium.calendar.CalendarContracts.SchedulingPreferences;
import app.circadium.calendar.CalendarContracts.SerializedLocation;
import app.circadium.calendar.CalendarContracts.SerializedTravelTime;
import app.circadium.persistence.entity.Category;
import app.circadium.persistence.entity.CategoryEvent;
import app.circadium.persistence.entity.CategoryTimeWindow;
import app.circadium.persistence.entity.EngineMessage;
import app.circadium.persistence.entity.EventExtendedProps;
import app.circadium.persistence.entity.EventTemplate;
import app.circadium.persistence.entity.Location;
import app.circadium.persistence.entity.Planner;
import app.circadium.persistence.entity.PlannerDependency;
import app.circadium.persistence.entity.Queue;
import app.circadium.persistence.entity.QueueMember;
import app.circadium.persistence.entity.SimpleEvent;
import app.circadium.persistence.entity.TravelEvent;
import app.circadium.persistence.entity.TravelTime;
import app.circadium.persistence.entity.UserSchedulingPreferences;
import app.circadium.persistence.enums.WeekDayType;
import app.circadium.persistence.repository.CategoryEventRepository;
import app.circadium.persistence.repository.CategoryRepository;
import app.circadium.persistence.repository.CategoryTimeWindowRepository;
import app.circadium.persistence.repository.EngineMessageRepository;
import app.circadium.persistence.repository.EventExtendedPropsRepository;
import app.circadium.persistence.repository.EventTemplateRepository;
import app.circadium.persistence.repository.LocationRepository;
import app.circadium.persistence.repository.PlannerDependencyRepository;
import app.circadium.persistence.repository.PlannerRepository;
import app.circadium.persistence.repository.QueueMemberRepository;
import app.circadium.persistence.repository.QueueRepository;
import app.circadium.persistence.repository.SimpleEventRepository;
import app.circadium.persistence.repository.TravelEventRepository;
import app.circadium.persistence.repository.TravelTimeRepository;
import app.circadium.persistence.repository.UserRepository;
import app.circadium.persistence.repository.UserSchedulingPreferencesRepository;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads a user's whole calendar state in the shape of {@link BootstrapPayload}. */
@Service
@RequiredArgsConstructor
public class CalendarBootstrapService {

    private final JdbcTemplate jdbcTemplate;
    private final UserRepository userRepository;
    private final PlannerRepository plannerRepository;
    private final SimpleEventRepository simpleEventRepository;
    private final EventExtendedPropsRepository extendedPropsRepository;
    private final EventTemplateRepository templateRepository;
    private final CategoryRepository categoryRepository;
    private final CategoryTimeWindowRepository timeWindowRepository;
    private final CategoryEventRepository categoryEventRepository;
    private final TravelEventRepository travelEventRepository;
    private final EngineMessageRepository engineMessageRepository;
    private final QueueRepository queueRepository;
    private final QueueMemberRepository queueMemberRepository;
    private final PlannerDependencyRepository dependencyRepository;
    private final LocationRepository locationRepository;
    private final TravelTimeRepository travelTimeRepository;
    private final UserSchedulingPreferencesRepository schedulingPreferencesRepository;

    /**
     * Every query runs in one repeatable-read snapshot, so {@code dataVersion} describes exactly the rows returned.
     * Read separately, a sync committing in between could hand the client a version newer than its rows, and the
     * client's next sync would then pass the version check while based on rows it never saw.
     */
    @Transactional(readOnly = true)
    public BootstrapPayload load(String userId) {
        // Set as the transaction's first statement rather than through @Transactional(isolation = ...): the JDBC
        // driver applies that as a session setting, which PgBouncer's transaction pooling (Neon's pooled URL) would
        // run on whichever server connection is free, possibly not the one the transaction then gets.
        jdbcTemplate.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");

        int dataVersion = userRepository.findDataVersionById(userId)
                .orElseThrow(() -> new AccountFlowException(HttpStatus.UNAUTHORIZED, "account_not_found",
                        "This account no longer exists."));

        Map<String, CalendarContracts.EventExtendedProps> propsByEvent = extendedPropsRepository
                .findByEventOwner(userId).stream()
                .collect(toMap(EventExtendedProps::getEventId, CalendarBootstrapService::toWire));
        Map<String, List<CalendarContracts.CategoryTimeWindow>> windowsByCategory = timeWindowRepository
                .findByCategoryOwner(userId).stream()
                .collect(groupingBy(CategoryTimeWindow::getCategoryId,
                        mapping(CalendarBootstrapService::toWire, toList())));
        Map<String, List<CalendarContracts.QueueMember>> membersByQueue = queueMemberRepository
                .findByQueueOwner(userId).stream()
                .collect(groupingBy(QueueMember::getQueueId, mapping(CalendarBootstrapService::toWire, toList())));

        return new BootstrapPayload(
                dataVersion,
                map(plannerRepository.findByUserIdOrderById(userId), CalendarBootstrapService::toWire),
                map(simpleEventRepository.findByUserIdOrderById(userId),
                        event -> toWire(event, propsByEvent.get(event.getId()))),
                map(templateRepository.findByUserIdOrderById(userId), CalendarBootstrapService::toWire),
                map(categoryRepository.findByUserIdOrderById(userId),
                        category -> toWire(category, windowsByCategory.getOrDefault(category.getId(), List.of()))),
                map(categoryEventRepository.findByUserIdOrderById(userId), CalendarBootstrapService::toWire),
                map(travelEventRepository.findByUserIdOrderById(userId), CalendarBootstrapService::toWire),
                map(engineMessageRepository.findByUserIdOrderById(userId), CalendarBootstrapService::toWire),
                map(queueRepository.findByUserIdOrderById(userId),
                        queue -> toWire(queue, membersByQueue.getOrDefault(queue.getId(), List.of()))),
                map(dependencyRepository.findByUserIdOrderById(userId), CalendarBootstrapService::toWire),
                map(locationRepository.findByUserIdOrderByCreatedAtAscIdAsc(userId), CalendarBootstrapService::toWire),
                map(travelTimeRepository.findByUserIdOrderById(userId), CalendarBootstrapService::toWire),
                schedulingPreferencesRepository.findByUserId(userId)
                        .map(CalendarBootstrapService::toWire)
                        .orElse(SchedulingPreferencesService.MISSING_ROW_DEFAULTS));
    }

    private static <T, R> List<R> map(List<T> rows, Function<T, R> mapper) {
        return rows.stream().map(mapper).toList();
    }

    static SchedulingPreferences toWire(UserSchedulingPreferences p) {
        return new SchedulingPreferences(p.getBufferTimeMinutes(), p.getDefaultTransportMode(), p.getWeekStartDay());
    }

    private static CalendarContracts.Planner toWire(Planner p) {
        return new CalendarContracts.Planner(p.getId(), p.getTitle(), p.getParentId(), p.getPlannerType(),
                p.getIsReady(), p.isTriaged(), p.getDuration(), p.getDeadline(), p.getStarts(), p.getRecurrence(),
                p.getRecurrenceExceptions(), p.getSplitting(), p.getCompletedSegments(), p.getMaxMinutesPerDay(),
                p.getEarliestStartDate(), p.getAllowedTimes(), p.getLinkedItemId(), p.getNotes(), p.getSortOrder(),
                p.getCompletedStartTime(), p.getCompletedEndTime(), p.getPriority(), p.getUserId(), p.getColor(),
                p.getLocationId(), p.isUseParentLocation(), p.getCategoryId(), iso(p.getCreatedAt()),
                iso(p.getUpdatedAt()));
    }

    private static CalendarContracts.SimpleEvent toWire(SimpleEvent e,
            CalendarContracts.EventExtendedProps extendedProps) {
        return new CalendarContracts.SimpleEvent(e.getId(), e.getTitle(), e.getStart(), e.getEnd(), e.getDuration(),
                e.getUserId(), e.getRrule(), e.getBackgroundColor(), e.getBorderColor(), iso(e.getCreatedAt()),
                iso(e.getUpdatedAt()), extendedProps);
    }

    private static CalendarContracts.EventExtendedProps toWire(EventExtendedProps p) {
        return new CalendarContracts.EventExtendedProps(p.getId(), p.getPlannerType(), p.getEventType(),
                p.getCompletedStartTime(), p.getCompletedEndTime(), p.getParentId(), p.getEventId(),
                p.isTrespassingStart(), p.isTrespassingEnd());
    }

    private static CalendarContracts.EventTemplate toWire(EventTemplate t) {
        return new CalendarContracts.EventTemplate(t.getId(), t.getTitle(), weekdayNumber(t.getStartDay()),
                t.getStartTime(), t.getUserId(), t.getDuration(), t.getColor(), t.getLocationId(),
                t.getRecurrenceExceptions(), iso(t.getCreatedAt()), iso(t.getUpdatedAt()));
    }

    /** The web's {@code weekdayToInt}: templates store the day as a name, category windows as this number. */
    private static int weekdayNumber(WeekDayType day) {
        return switch (day) {
            case sunday -> 0;
            case monday -> 1;
            case tuesday -> 2;
            case wednesday -> 3;
            case thursday -> 4;
            case friday -> 5;
            case saturday -> 6;
        };
    }

    private static CalendarContracts.Category toWire(Category c, List<CalendarContracts.CategoryTimeWindow> timeSlots) {
        return new CalendarContracts.Category(c.getId(), c.getName(), c.getIcon(), c.getColor(), c.getSortOrder(),
                c.isUseTimeWindows(), c.isStrict(), c.isConfineToOwnWindows(), c.getLocationId(), c.getParentId(),
                c.getUserId(), iso(c.getCreatedAt()), iso(c.getUpdatedAt()), timeSlots);
    }

    private static CalendarContracts.CategoryTimeWindow toWire(CategoryTimeWindow w) {
        return new CalendarContracts.CategoryTimeWindow(w.getId(), w.getDay(), w.getStartTime(), w.getEndTime(),
                w.getRecurrenceExceptions(), w.getCategoryId(), w.getUserId());
    }

    private static CalendarContracts.CategoryEvent toWire(CategoryEvent e) {
        return new CalendarContracts.CategoryEvent(e.getId(), e.getStart(), e.getEnd(), e.isTrespassingStart(),
                e.isTrespassingEnd(), e.getCategoryTimeWindowId(), e.getCategoryId(), e.getUserId(),
                iso(e.getCreatedAt()), iso(e.getUpdatedAt()));
    }

    private static CalendarContracts.TravelEvent toWire(TravelEvent e) {
        return new CalendarContracts.TravelEvent(e.getId(), e.getStart(), e.getEnd(), e.getFromLocationId(),
                e.getToLocationId(), e.getTravelMinutes(), e.getRequiredTravelMinutes(), e.isInsufficientTravel(),
                e.isOverconstrained(), e.getUserId(), iso(e.getCreatedAt()), iso(e.getUpdatedAt()));
    }

    private static CalendarContracts.EngineMessage toWire(EngineMessage m) {
        return new CalendarContracts.EngineMessage(m.getId(), m.getType(), m.getTone(), m.getPayload(),
                m.isDismissed(), m.getUserId(), iso(m.getCreatedAt()), iso(m.getUpdatedAt()));
    }

    private static CalendarContracts.Queue toWire(Queue q, List<CalendarContracts.QueueMember> members) {
        return new CalendarContracts.Queue(q.getId(), q.getTitle(), q.getSortOrder(), q.getColor(),
                q.getCategoryId(), q.getUserId(), iso(q.getCreatedAt()), iso(q.getUpdatedAt()), members);
    }

    private static CalendarContracts.QueueMember toWire(QueueMember m) {
        return new CalendarContracts.QueueMember(m.getId(), m.getSortOrder(), m.getQueueId(), m.getPlannerId(),
                m.getUserId(), iso(m.getCreatedAt()), iso(m.getUpdatedAt()));
    }

    private static CalendarContracts.PlannerDependency toWire(PlannerDependency d) {
        return new CalendarContracts.PlannerDependency(d.getId(), d.getPredecessorId(), d.getSuccessorId(),
                d.getUserId(), iso(d.getCreatedAt()), iso(d.getUpdatedAt()));
    }

    private static SerializedLocation toWire(Location l) {
        return new SerializedLocation(l.getId(), l.getName(), l.getAddress(), l.getPlaceId());
    }

    private static SerializedTravelTime toWire(TravelTime t) {
        return new SerializedTravelTime(t.getId(), t.getFromLocationId(), t.getToLocationId(), t.getTransportMode(),
                t.getGoogleRushHourMinutes(), t.getGoogleRegularMinutes(), t.getGoogleNightMinutes(),
                t.getCustomRushHourMinutes(), t.getCustomRegularMinutes(), t.getCustomNightMinutes(),
                t.getUnroutableAt() != null);
    }
}
