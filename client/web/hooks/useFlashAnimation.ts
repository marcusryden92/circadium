"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Flash a boolean to true for `durationMs`, then back to false. Used for
// shake/glow feedback when the user attempts a blocked action — the visual
// cue runs for a fixed duration and resets itself.
//
// Repeated triggers while a flash is already in-flight are ignored so the
// animation isn't cut short.
export function useFlashBoolean(
  durationMs: number,
): readonly [boolean, () => void] {
  const [active, setActive] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const trigger = useCallback(() => {
    if (active) return;
    setActive(true);
    timerRef.current = window.setTimeout(() => {
      setActive(false);
      timerRef.current = null;
    }, durationMs);
  }, [active, durationMs]);

  return [active, trigger] as const;
}

// Flash a value (typically a message string) for `durationMs`, then clear
// back to `initial`. Repeated triggers reset the timer so the latest message
// gets a full window.
export function useFlashValue<T>(
  durationMs: number,
  initial: T,
): readonly [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const trigger = useCallback(
    (next: T) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setValue(next);
      timerRef.current = window.setTimeout(() => {
        setValue(initial);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs, initial],
  );

  return [value, trigger] as const;
}
