import { SimpleEvent } from "@/types/prisma";
import { objectsAreEqual } from "../../../generalUtils";

// Rebuilt events must keep a stable identity across regens. Minting a fresh
// extendedProps.id and createdAt/updatedAt on every emit marked every event
// row as changed in every sync (full-table update churn), and each of those
// syncs bumped the OCC dataVersion — so a second open window's next sync was
// always stale and its in-flight edit got silently discarded by
// adoptFreshServerState.
export function stabilizeEvent(
  candidate: SimpleEvent,
  prev: SimpleEvent | undefined,
): SimpleEvent {
  if (!prev) return candidate;

  const merged: SimpleEvent = {
    ...candidate,
    createdAt: prev.createdAt,
    extendedProps: candidate.extendedProps
      ? {
          ...candidate.extendedProps,
          id: prev.extendedProps?.id ?? candidate.extendedProps.id,
          // Trespass flags are mark-pass-owned: builders never set them, but
          // persisted rows carry them explicitly. When the previous emit has
          // them, carry the values forward (markTrespassingEvents recomputes
          // after assembly) so the key-count-sensitive equality below can
          // still match; when it doesn't, add nothing — a fresh key would
          // break identity against a flagless previous emit.
          ...(candidate.extendedProps.trespassingStart === undefined &&
          prev.extendedProps?.trespassingStart !== undefined
            ? { trespassingStart: prev.extendedProps.trespassingStart }
            : {}),
          ...(candidate.extendedProps.trespassingEnd === undefined &&
          prev.extendedProps?.trespassingEnd !== undefined
            ? { trespassingEnd: prev.extendedProps.trespassingEnd }
            : {}),
        }
      : candidate.extendedProps,
  };

  if (
    objectsAreEqual(
      merged as unknown as Record<string, unknown>,
      prev as unknown as Record<string, unknown>,
      ["updatedAt"],
    )
  ) {
    return prev;
  }
  return merged;
}
