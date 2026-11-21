import { useEffect, useState } from "react";

// Returns a Date that re-emits at a steady cadence so time-derived UI
// (NOW/NEXT flags, LATE/OVERDUE pills, "still upcoming today" pruning)
// stays current without a hard refresh. 30 s is fine-grained enough for
// minute-level pills and cheap enough to leave running while the tab is
// open. The first tick is aligned to a wall-clock minute boundary so
// rows that change at :00 do so together.
export function useTickingNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const update = () => setNow(new Date());
    let intervalId: number | undefined;
    const msToNextMinute = 60_000 - (Date.now() % 60_000) || intervalMs;
    const alignId = window.setTimeout(() => {
      update();
      intervalId = window.setInterval(update, intervalMs);
    }, msToNextMinute);
    return () => {
      window.clearTimeout(alignId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [intervalMs]);

  return now;
}
