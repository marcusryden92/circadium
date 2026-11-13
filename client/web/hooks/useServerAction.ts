"use client";

import { useCallback, useState, useTransition } from "react";

export type ServerActionStatus =
  | { tone: "error" | "success"; text: string }
  | null;

export type RunOptions = {
  successMessage?: string;
};

/**
 * Wraps a server action / async mutation with the transition + try/catch +
 * status pattern that every Settings card and Locations handler was
 * re-implementing inline. Callers get a single `run` function that triggers
 * the work, surfaces a `status` for inline feedback, and exposes `isPending`
 * for disabled-button states.
 */
export function useServerAction<Args extends unknown[], R = unknown>(
  action: (...args: Args) => Promise<R>,
) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<ServerActionStatus>(null);

  const run = useCallback(
    (...args: Args) => {
      return new Promise<R | undefined>((resolve) => {
        startTransition(async () => {
          try {
            const result = await action(...args);
            resolve(result);
          } catch (err) {
            setStatus({
              tone: "error",
              text: err instanceof Error ? err.message : "Something went wrong",
            });
            resolve(undefined);
          }
        });
      });
    },
    [action],
  );

  const setSuccess = useCallback((text: string) => {
    setStatus({ tone: "success", text });
  }, []);

  const setError = useCallback((text: string) => {
    setStatus({ tone: "error", text });
  }, []);

  const clear = useCallback(() => setStatus(null), []);

  return { run, status, isPending, setSuccess, setError, clear };
}
