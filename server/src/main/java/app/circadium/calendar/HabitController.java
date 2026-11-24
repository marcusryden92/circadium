package app.circadium.calendar;

import app.circadium.calendar.HabitService.HabitState;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Tag(name = "Calendar")
public class HabitController {

    private final HabitService habitService;

    /**
     * One optionally-patched field. The assistant's delta distinguishes "leave the field alone"
     * from "set it to null", which plain JSON nullability cannot carry — so the wire says it
     * outright: an absent or unset PatchField means untouched.
     */
    @Schema(description = "set false (or the whole object absent) leaves the field untouched; "
            + "set true applies value, null included.")
    public record PatchField(boolean set, String value) {

        static boolean isSet(PatchField field) {
            return field != null && field.set();
        }
    }

    public record CreateBucketRequest(@NotBlank String name, String color) {
    }

    public record UpdateBucketRequest(@NotBlank String name, PatchField color) {
    }

    public record CreateHabitRequest(@NotBlank String name, String color, String bucketId) {
    }

    public record AddHabitItemRequest(@NotBlank String plannerId) {
    }

    public record ApplyHabitChangesRequest(
            @NotNull List<@NotNull String> bucketDeletes,
            @NotNull List<@NotNull @Valid BucketCreate> bucketCreates,
            @NotNull List<@NotNull @Valid BucketUpdate> bucketUpdates,
            @NotNull List<@NotNull String> deletes,
            @NotNull List<@NotNull @Valid HabitCreate> creates,
            @NotNull List<@NotNull @Valid HabitUpdate> updates,
            @NotNull List<@NotNull @Valid LinkChange> addItems,
            @NotNull List<@NotNull @Valid LinkChange> removeItems) {

        public record BucketCreate(@NotNull String id, String name, String color) {
        }

        public record BucketUpdate(@NotNull String id, PatchField name, PatchField color) {
        }

        public record HabitCreate(@NotNull String id, String name, String color, String bucketId,
                @NotNull List<@NotNull String> itemPlannerIds) {
        }

        public record HabitUpdate(@NotNull String id, PatchField name, PatchField color,
                PatchField bucketId) {
        }

        public record LinkChange(@NotNull String habitId, @NotNull String plannerId) {
        }
    }

    @GetMapping("/habits")
    @Operation(summary = "The caller's habit trackers",
            description = "Buckets, habits and tracked-item links, mirrored wholesale into the client "
                    + "store. Outside the sync diff: nothing here moves dataVersion.")
    @ApiResponse(responseCode = "200", description = "The three lists")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public HabitState state(@AuthenticationPrincipal Jwt jwt) {
        return habitService.state(jwt.getSubject());
    }

    @PostMapping("/habits/buckets")
    @Operation(summary = "Create a habit bucket")
    @ApiResponse(responseCode = "200", description = "The created bucket")
    @ApiResponse(responseCode = "400", description = "Blank name (code name_required)")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public CalendarContracts.HabitBucket createBucket(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateBucketRequest request) {
        return habitService.createBucket(jwt.getSubject(), request.name(), request.color());
    }

    @PatchMapping("/habits/buckets/{bucketId}")
    @Operation(summary = "Rename or recolor a habit bucket")
    @ApiResponse(responseCode = "200", description = "The bucket after the write")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "Not the caller's bucket (code bucket_not_found)")
    public CalendarContracts.HabitBucket updateBucket(@AuthenticationPrincipal Jwt jwt,
            @PathVariable String bucketId, @Valid @RequestBody UpdateBucketRequest request) {
        return habitService.updateBucket(jwt.getSubject(), bucketId, request.name(), request.color());
    }

    @DeleteMapping("/habits/buckets/{bucketId}")
    @Operation(summary = "Delete a habit bucket",
            description = "Its habits survive unsorted (the FK's SetNull); a missing bucket is a no-op.")
    @ApiResponse(responseCode = "204", description = "The bucket is gone")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public ResponseEntity<Void> deleteBucket(@AuthenticationPrincipal Jwt jwt,
            @PathVariable String bucketId) {
        habitService.deleteBucket(jwt.getSubject(), bucketId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/habits")
    @Operation(summary = "Create a habit tracker",
            description = "The tracker only — repeating items are created elsewhere and linked after. "
                    + "A foreign or unknown bucket silently lands as unsorted.")
    @ApiResponse(responseCode = "200", description = "The created habit")
    @ApiResponse(responseCode = "400", description = "Blank name (code name_required)")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public CalendarContracts.Habit createHabit(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateHabitRequest request) {
        return habitService.createHabit(jwt.getSubject(), request.name(), request.color(),
                request.bucketId());
    }

    @DeleteMapping("/habits/{habitId}")
    @Operation(summary = "Delete a habit tracker",
            description = "Its links cascade; the tracked items are never touched. Missing is a no-op.")
    @ApiResponse(responseCode = "204", description = "The habit is gone")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public ResponseEntity<Void> deleteHabit(@AuthenticationPrincipal Jwt jwt,
            @PathVariable String habitId) {
        habitService.deleteHabit(jwt.getSubject(), habitId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/habits/{habitId}/items")
    @Operation(summary = "Track an item with a habit",
            description = "Idempotent: an already-tracked item answers the existing link. Only a "
                    + "top-level repeating item is accepted.")
    @ApiResponse(responseCode = "200", description = "The link")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "404", description = "Not the caller's habit or item "
            + "(codes habit_not_found, item_not_found)")
    @ApiResponse(responseCode = "409", description = "The item does not repeat (code item_not_repeating)")
    public CalendarContracts.HabitItem addItem(@AuthenticationPrincipal Jwt jwt,
            @PathVariable String habitId, @Valid @RequestBody AddHabitItemRequest request) {
        return habitService.addItem(jwt.getSubject(), habitId, request.plannerId());
    }

    @DeleteMapping("/habits/{habitId}/items")
    @Operation(summary = "Stop tracking an item", description = "A missing link is a no-op.")
    @ApiResponse(responseCode = "204", description = "The link is gone")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public ResponseEntity<Void> removeItem(@AuthenticationPrincipal Jwt jwt,
            @PathVariable String habitId, @RequestParam String plannerId) {
        habitService.removeItem(jwt.getSubject(), habitId, plannerId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/habits/apply")
    @Operation(summary = "Apply the assistant's habit delta",
            description = "One transaction, one timestamp. Unknown or foreign ids are skipped, never "
                    + "failures; bucket and habit ids are caller-supplied (the draft's uuids become "
                    + "the rows); link adds are filtered to owned habits and repeating items.")
    @ApiResponse(responseCode = "200", description = "The fresh state after the batch")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public HabitState applyChanges(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ApplyHabitChangesRequest request) {
        return habitService.applyChanges(jwt.getSubject(), request);
    }
}
