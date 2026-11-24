package app.circadium.calendar;

import app.circadium.auth.AccountFlowException;
import app.circadium.calendar.HabitController.ApplyHabitChangesRequest;
import app.circadium.calendar.HabitController.PatchField;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.Habit;
import app.circadium.persistence.entity.HabitBucket;
import app.circadium.persistence.entity.HabitItem;
import app.circadium.persistence.entity.Planner;
import app.circadium.persistence.repository.HabitBucketRepository;
import app.circadium.persistence.repository.HabitItemRepository;
import app.circadium.persistence.repository.HabitRepository;
import app.circadium.persistence.repository.PlannerRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The habit tracking layer, ported from {@code actions/habits.ts}: buckets, habits and tracked-item
 * links, plus the assistant's batched delta. The engine never reads any of it and nothing here
 * moves {@code users.dataVersion}. Unknown or foreign ids inside the batch are skipped, never
 * failures — the concurrent-safety rules the delta builder documents.
 */
@Service
@RequiredArgsConstructor
public class HabitService {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> VALID_FREQS = Set.of("daily", "weekly", "monthly");

    private final HabitBucketRepository bucketRepository;
    private final HabitRepository habitRepository;
    private final HabitItemRepository itemRepository;
    private final PlannerRepository plannerRepository;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public record HabitState(List<CalendarContracts.HabitBucket> buckets,
            List<CalendarContracts.Habit> habits, List<CalendarContracts.HabitItem> items) {
    }

    @Transactional(readOnly = true)
    public HabitState state(String userId) {
        return new HabitState(
                bucketRepository.findByUserIdOrderBySortOrderAscCreatedAtAsc(userId).stream()
                        .map(HabitService::toWire).toList(),
                habitRepository.findByUserIdOrderBySortOrderAscCreatedAtAsc(userId).stream()
                        .map(HabitService::toWire).toList(),
                itemRepository.findByUserId(userId).stream().map(HabitService::toWire).toList());
    }

    @Transactional
    public CalendarContracts.HabitBucket createBucket(String userId, String name, String color) {
        String trimmed = requireName(name, "Bucket name is required");
        Instant now = DbTime.now(clock);
        HabitBucket bucket = new HabitBucket();
        bucket.setId(UUID.randomUUID().toString());
        bucket.setUserId(userId);
        bucket.setName(trimmed);
        bucket.setColor(color);
        bucket.setSortOrder(nextBucketSortOrder(userId));
        bucket.setCreatedAt(now);
        bucket.setUpdatedAt(now);
        bucketRepository.save(bucket);
        return toWire(bucket);
    }

    @Transactional
    public CalendarContracts.HabitBucket updateBucket(String userId, String bucketId, String name,
            PatchField color) {
        HabitBucket bucket = bucketRepository.findByIdAndUserId(bucketId, userId)
                .orElseThrow(() -> new AccountFlowException(HttpStatus.NOT_FOUND, "bucket_not_found",
                        "Bucket not found"));
        bucket.setName(requireName(name, "Bucket name is required"));
        if (PatchField.isSet(color)) {
            bucket.setColor(color.value());
        }
        bucket.setUpdatedAt(DbTime.now(clock));
        bucketRepository.save(bucket);
        return toWire(bucket);
    }

    /** A missing or foreign id is a no-op; habits survive via the bucket FK's SetNull. */
    @Transactional
    public void deleteBucket(String userId, String bucketId) {
        bucketRepository.deleteByIdAndUserId(bucketId, userId);
    }

    @Transactional
    public CalendarContracts.Habit createHabit(String userId, String name, String color, String bucketId) {
        String trimmed = requireName(name, "Habit name is required");
        Instant now = DbTime.now(clock);
        Habit habit = new Habit();
        habit.setId(UUID.randomUUID().toString());
        habit.setUserId(userId);
        habit.setName(trimmed);
        habit.setColor(color);
        habit.setBucketId(ownedBucketIdOrNull(userId, bucketId, Set.of()));
        habit.setSortOrder(0);
        habit.setCreatedAt(now);
        habit.setUpdatedAt(now);
        habitRepository.save(habit);
        return toWire(habit);
    }

    @Transactional
    public void deleteHabit(String userId, String habitId) {
        habitRepository.deleteByIdAndUserId(habitId, userId);
    }

    /** Idempotent: a link that already exists is returned, not an error (double-click safety). */
    @Transactional
    public CalendarContracts.HabitItem addItem(String userId, String habitId, String plannerId) {
        habitRepository.findByIdAndUserId(habitId, userId)
                .orElseThrow(() -> new AccountFlowException(HttpStatus.NOT_FOUND, "habit_not_found",
                        "Habit not found"));
        Planner planner = plannerRepository.findByIdAndUserId(plannerId, userId)
                .orElseThrow(() -> new AccountFlowException(HttpStatus.NOT_FOUND, "item_not_found",
                        "Item not found"));
        if (!isTrackable(planner)) {
            throw new AccountFlowException(HttpStatus.CONFLICT, "item_not_repeating",
                    "Only repeating items can feed a habit");
        }
        return itemRepository.findByHabitIdAndPlannerId(habitId, plannerId)
                .map(HabitService::toWire)
                .orElseGet(() -> {
                    HabitItem item = new HabitItem();
                    item.setId(UUID.randomUUID().toString());
                    item.setHabitId(habitId);
                    item.setPlannerId(plannerId);
                    item.setUserId(userId);
                    item.setCreatedAt(DbTime.now(clock));
                    itemRepository.save(item);
                    return toWire(item);
                });
    }

    @Transactional
    public void removeItem(String userId, String habitId, String plannerId) {
        itemRepository.deleteByUserIdAndHabitIdAndPlannerId(userId, habitId, plannerId);
    }

    /**
     * The assistant's delta, replayed in one transaction with one shared timestamp. Order matters:
     * bucket deletes, creates and updates land before habits so a habit may reference a bucket
     * created in the same batch; link work runs last against the saved habit set.
     */
    @Transactional
    public HabitState applyChanges(String userId, ApplyHabitChangesRequest changes) {
        Instant now = DbTime.now(clock);

        for (String bucketId : changes.bucketDeletes()) {
            bucketRepository.deleteByIdAndUserId(bucketId, userId);
        }

        Set<String> createdBucketIds = new HashSet<>();
        int nextOrder = nextBucketSortOrder(userId);
        for (ApplyHabitChangesRequest.BucketCreate create : changes.bucketCreates()) {
            String name = create.name() == null ? "" : create.name().trim();
            if (name.isEmpty()) {
                continue;
            }
            HabitBucket bucket = new HabitBucket();
            bucket.setId(create.id());
            bucket.setUserId(userId);
            bucket.setName(name);
            bucket.setColor(create.color());
            bucket.setSortOrder(nextOrder++);
            bucket.setCreatedAt(now);
            bucket.setUpdatedAt(now);
            bucketRepository.save(bucket);
            createdBucketIds.add(create.id());
        }

        for (ApplyHabitChangesRequest.BucketUpdate update : changes.bucketUpdates()) {
            HabitBucket bucket = bucketRepository.findByIdAndUserId(update.id(), userId).orElse(null);
            if (bucket == null) {
                continue;
            }
            if (PatchField.isSet(update.name())) {
                String name = update.name().value() == null ? "" : update.name().value().trim();
                if (!name.isEmpty()) {
                    bucket.setName(name);
                }
            }
            if (PatchField.isSet(update.color())) {
                bucket.setColor(update.color().value());
            }
            bucket.setUpdatedAt(now);
            bucketRepository.save(bucket);
        }

        for (String habitId : changes.deletes()) {
            habitRepository.deleteByIdAndUserId(habitId, userId);
        }

        List<LinkWanted> wantedLinks = new ArrayList<>();
        for (ApplyHabitChangesRequest.HabitCreate create : changes.creates()) {
            String name = create.name() == null ? "" : create.name().trim();
            if (name.isEmpty()) {
                continue;
            }
            Habit habit = new Habit();
            habit.setId(create.id());
            habit.setUserId(userId);
            habit.setName(name);
            habit.setColor(create.color());
            habit.setBucketId(ownedBucketIdOrNull(userId, create.bucketId(), createdBucketIds));
            habit.setSortOrder(0);
            habit.setCreatedAt(now);
            habit.setUpdatedAt(now);
            habitRepository.save(habit);
            for (String plannerId : create.itemPlannerIds()) {
                wantedLinks.add(new LinkWanted(create.id(), plannerId));
            }
        }

        for (ApplyHabitChangesRequest.HabitUpdate update : changes.updates()) {
            Habit habit = habitRepository.findByIdAndUserId(update.id(), userId).orElse(null);
            if (habit == null) {
                continue;
            }
            if (PatchField.isSet(update.name())) {
                String name = update.name().value() == null ? "" : update.name().value().trim();
                if (!name.isEmpty()) {
                    habit.setName(name);
                }
            }
            if (PatchField.isSet(update.color())) {
                habit.setColor(update.color().value());
            }
            if (PatchField.isSet(update.bucketId())) {
                habit.setBucketId(ownedBucketIdOrNull(userId, update.bucketId().value(), createdBucketIds));
            }
            habit.setUpdatedAt(now);
            habitRepository.save(habit);
        }

        for (ApplyHabitChangesRequest.LinkChange add : changes.addItems()) {
            wantedLinks.add(new LinkWanted(add.habitId(), add.plannerId()));
        }
        insertValidLinks(userId, wantedLinks, now);

        for (ApplyHabitChangesRequest.LinkChange removal : changes.removeItems()) {
            itemRepository.deleteByUserIdAndHabitIdAndPlannerId(userId, removal.habitId(),
                    removal.plannerId());
        }

        return state(userId);
    }

    private record LinkWanted(String habitId, String plannerId) {
    }

    /** Links are filtered to owned habits and trackable planners; duplicates are absorbed by the unique. */
    private void insertValidLinks(String userId, List<LinkWanted> wanted, Instant now) {
        if (wanted.isEmpty()) {
            return;
        }
        Set<String> ownedHabits = habitRepository
                .findByUserIdAndIdIn(userId, wanted.stream().map(LinkWanted::habitId).collect(Collectors.toSet()))
                .stream().map(Habit::getId).collect(Collectors.toSet());
        Set<String> trackablePlanners = plannerRepository
                .findByUserIdAndIdIn(userId, wanted.stream().map(LinkWanted::plannerId).collect(Collectors.toSet()))
                .stream().filter(HabitService::isTrackable).map(Planner::getId).collect(Collectors.toSet());

        Map<String, LinkWanted> deduped = new LinkedHashMap<>();
        for (LinkWanted link : wanted) {
            if (ownedHabits.contains(link.habitId()) && trackablePlanners.contains(link.plannerId())) {
                deduped.putIfAbsent(link.habitId() + "|" + link.plannerId(), link);
            }
        }
        for (LinkWanted link : deduped.values()) {
            jdbcTemplate.update("INSERT INTO \"HabitItems\" (\"id\", \"habitId\", \"plannerId\","
                            + " \"userId\", \"createdAt\") VALUES (?, ?, ?, ?, ?)"
                            + " ON CONFLICT (\"habitId\", \"plannerId\") DO NOTHING",
                    UUID.randomUUID().toString(), link.habitId(), link.plannerId(), userId,
                    DbTime.toDb(now));
        }
    }

    /** A foreign or unknown bucket silently becomes "unsorted", never an error. */
    private String ownedBucketIdOrNull(String userId, String bucketId, Set<String> createdInBatch) {
        if (bucketId == null) {
            return null;
        }
        if (createdInBatch.contains(bucketId)) {
            return bucketId;
        }
        return bucketRepository.findByIdAndUserId(bucketId, userId).map(HabitBucket::getId).orElse(null);
    }

    private int nextBucketSortOrder(String userId) {
        return bucketRepository.findFirstByUserIdOrderBySortOrderDesc(userId)
                .map(bucket -> bucket.getSortOrder() + 1)
                .orElse(0);
    }

    /**
     * The TS plannerIsTrackable: a top-level row whose recurrence parses (flexible rule on a
     * task/goal, occurrence rule on a plan). Only {@code freq} gates — interval and until are
     * lenient in the parser.
     */
    static boolean isTrackable(Planner planner) {
        if (planner.getParentId() != null) {
            return false;
        }
        String recurrence = planner.getRecurrence();
        if (recurrence == null || recurrence.isBlank()) {
            return false;
        }
        try {
            JsonNode node = JSON.readTree(recurrence);
            JsonNode freq = node.get("freq");
            return freq != null && freq.isString() && VALID_FREQS.contains(freq.stringValue());
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static String requireName(String name, String message) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "name_required", message);
        }
        return trimmed;
    }

    private static CalendarContracts.HabitBucket toWire(HabitBucket bucket) {
        return new CalendarContracts.HabitBucket(bucket.getId(), bucket.getUserId(), bucket.getName(),
                bucket.getColor(), bucket.getSortOrder(), CalendarContracts.iso(bucket.getCreatedAt()),
                CalendarContracts.iso(bucket.getUpdatedAt()));
    }

    private static CalendarContracts.Habit toWire(Habit habit) {
        return new CalendarContracts.Habit(habit.getId(), habit.getUserId(), habit.getName(),
                habit.getColor(), habit.getBucketId(), habit.getSortOrder(),
                CalendarContracts.iso(habit.getCreatedAt()), CalendarContracts.iso(habit.getUpdatedAt()));
    }

    private static CalendarContracts.HabitItem toWire(HabitItem item) {
        return new CalendarContracts.HabitItem(item.getId(), item.getHabitId(), item.getPlannerId(),
                item.getUserId(), CalendarContracts.iso(item.getCreatedAt()));
    }
}
