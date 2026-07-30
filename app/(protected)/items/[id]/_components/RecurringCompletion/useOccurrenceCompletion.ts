import { useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import type { OccurrenceCompletion } from "@/types/prisma";
import {
  logOccurrenceCompletion,
  unlogOccurrenceCompletion,
} from "@/actions/occurrenceCompletions";
import {
  upsertOccurrenceCompletion,
  removeOccurrenceCompletion,
} from "@/redux/slices/occurrenceCompletionsSlice";

// Log / unlog an occurrence completion from item detail. The occurrence log is
// out-of-band (never bumps dataVersion), so we mirror the slice OPTIMISTICALLY
// and regen on the same tick — the instances list and calendar reflect the
// click on the next frame — then persist in the background, reverting the slice
// if the write fails. Writes are serialized through one chain so a rapid
// double-click can't land out of order (the guard EventContent uses).
export function useOccurrenceCompletion(regen: () => void) {
  const dispatch = useDispatch<AppDispatch>();
  const rows = useSelector((s: RootState) => s.occurrenceCompletions.rows);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  return useCallback(
    (
      plannerId: string,
      occurrenceKey: string,
      window: { start: string; end: string } | null,
    ) => {
      const prior =
        rows.find(
          (r) => r.plannerId === plannerId && r.occurrenceKey === occurrenceKey,
        ) ?? null;

      if (window) {
        // Temp id/userId until the persisted row reconciles; the engine and the
        // instance views only read plannerId/occurrenceKey/start/end.
        const optimistic: OccurrenceCompletion = {
          id: prior?.id ?? `optimistic-${plannerId}-${occurrenceKey}`,
          plannerId,
          userId: prior?.userId ?? "",
          occurrenceKey,
          start: window.start,
          end: window.end,
          createdAt: prior?.createdAt ?? new Date().toISOString(),
        };
        dispatch(upsertOccurrenceCompletion(optimistic));
      } else {
        dispatch(removeOccurrenceCompletion({ plannerId, occurrenceKey }));
      }
      regen();

      const revert = () => {
        if (prior) dispatch(upsertOccurrenceCompletion(prior));
        else dispatch(removeOccurrenceCompletion({ plannerId, occurrenceKey }));
        regen();
      };

      chain.current = chain.current
        .catch(() => {})
        .then(() =>
          window
            ? logOccurrenceCompletion({
                plannerId,
                occurrenceKey,
                start: window.start,
                end: window.end,
              }).then((row) => {
                dispatch(upsertOccurrenceCompletion(row));
              })
            : unlogOccurrenceCompletion({ plannerId, occurrenceKey }),
        )
        .catch(revert);
    },
    [dispatch, regen, rows],
  );
}
