"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import { wrap, panel, title, body } from "./error.css";

// Boundary for protected pages. When a cold start makes a route's server data
// throw, this catches it (instead of a blank page) and soft-retries once via
// reset() — which re-renders the segment against a now-warm DB — before
// offering a manual reload. The timestamp guard survives the boundary
// remounting after a failed reset, so a persistent error can't loop.
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const KEY = "circadium.protectedRetryAt";
    const now = Date.now();
    const last = Number(sessionStorage.getItem(KEY) ?? "0");
    if (now - last > 15_000) {
      sessionStorage.setItem(KEY, String(now));
      reset();
    }
  }, [error, reset]);

  return (
    <div className={wrap}>
      <div className={panel}>
        <h2 className={title}>Reconnecting…</h2>
        <p className={body}>
          Something didn&rsquo;t load. Retrying now — if it sticks, reload the
          page.
        </p>
        <Button variant="solid" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
