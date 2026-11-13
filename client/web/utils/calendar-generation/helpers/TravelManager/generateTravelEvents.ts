import { TravelEvent } from "@/types/prisma";
import { Slot, TravelSlot } from "../../models/TimeSlot";
import { dateTimeService } from "../../utils/dateTimeService";

// Merge shards of one logical travel into a single rendered event. Shards
// share a travelId and are contiguous in the slot array; we collapse them
// here so downstream renders one block per logical travel. Endpoints must
// match across shards — a static-pass bug producing A→B + C→D under the
// same travelId would otherwise silently flatten to A→D with the middle
// leg gone.
function mergeShardsIntoLogicalTravels(travelSlots: TravelSlot[]): TravelSlot[] {
  if (travelSlots.length === 0) return [];
  // Sort by start so contiguous shards from the same travelId end up adjacent.
  const sorted = [...travelSlots].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const merged: TravelSlot[] = [];
  for (const shard of sorted) {
    const key = shard.travelId ?? shard.eventId;
    const last = merged[merged.length - 1];
    const lastKey = last && (last.travelId ?? last.eventId);
    const sameTravel =
      !!last &&
      lastKey === key &&
      last.end.getTime() === shard.start.getTime();

    if (sameTravel) {
      const endpointsMatch =
        last.travelFromLocationId === shard.travelFromLocationId &&
        last.travelToLocationId === shard.travelToLocationId;
      if (!endpointsMatch) {
        // Refuse to merge — surface the inconsistency as separate rows so
        // the bug is visible instead of producing a fictional A→D row.
        console.warn(
          "Refusing to merge travel shards with mismatched endpoints",
          {
            travelId: key,
            lastFrom: last.travelFromLocationId,
            lastTo: last.travelToLocationId,
            shardFrom: shard.travelFromLocationId,
            shardTo: shard.travelToLocationId,
          },
        );
        merged.push({ ...shard });
        continue;
      }

      // Extend the in-flight merged entry. Markers OR across shards.
      last.end = shard.end;
      last.durationMinutes = Math.floor(
        (last.end.getTime() - last.start.getTime()) / 60000,
      );
      last.insufficientTravel =
        last.insufficientTravel || shard.insufficientTravel;
      last.overconstrained =
        (last.overconstrained ?? false) || (shard.overconstrained ?? false);
      last.requiredTravelMinutes = Math.max(
        last.requiredTravelMinutes,
        shard.requiredTravelMinutes,
      );
      // Concatenate consumedCategoryIds without duplicates.
      const ids = new Set([
        ...(last.consumedCategoryIds ?? []),
        ...(shard.consumedCategoryIds ?? []),
      ]);
      last.consumedCategoryIds = [...ids];
    } else {
      // Start a new entry — clone so we don't mutate the source shard.
      merged.push({ ...shard });
    }
  }
  return merged;
}

// Id keys on (from, to, local date/time). Local-time keying tracks the
// user's intent — a 9 AM gym remains "9 AM" through DST so the same logical
// occurrence keeps its id. The trade-off: a user who changes machine
// timezone WILL get fresh ids on their next regen (a 9 AM Stockholm gym
// re-keyed as a 9 AM LA gym is, intentionally, a different occurrence).
// Pipe separators avoid hyphen ambiguity with CUIDs/UUIDs.
// createdAt/updatedAt empty: DB owns them.
export function generateTravelEvents(
  slots: Slot[],
  userId: string,
): TravelEvent[] {
  const travelSlots = mergeShardsIntoLogicalTravels(
    slots.filter((s): s is TravelSlot => s.type === "travel"),
  );

  return travelSlots.map((slot: TravelSlot): TravelEvent => {
    const fromKey = slot.travelFromLocationId ?? "anywhere";
    const toKey = slot.travelToLocationId ?? "anywhere";
    const localKey = `${dateTimeService.getDayKey(slot.start)}T${dateTimeService.formatTime(slot.start)}`;

    return {
      id: `${fromKey}|${toKey}|${localKey}`,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      fromLocationId: slot.travelFromLocationId,
      toLocationId: slot.travelToLocationId,
      travelMinutes: slot.durationMinutes,
      requiredTravelMinutes:
        slot.requiredTravelMinutes > 0 ? slot.requiredTravelMinutes : null,
      insufficientTravel: slot.insufficientTravel,
      overconstrained: slot.overconstrained ?? false,
      userId,
      createdAt: "",
      updatedAt: "",
    };
  });
}
