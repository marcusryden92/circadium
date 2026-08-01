"use client";

// Inline styles only, no theme tokens: this is the fallback for when the root
// layout (and thus the theme/CSS pipeline) failed to render.
/* eslint-disable theme/no-raw-scale-values */

import { useEffect, useState } from "react";

// Top-level safety net. A cold start (serverless wake + Neon compute resuming)
// can make the root layout's first DB/auth calls throw; without this the tab
// renders blank. This catches that and reloads once — the same recovery the
// user was doing by hand — before falling back to a manual retry. Fully
// self-contained (own html/body, inline styles) because it renders when the
// theme/CSS pipeline itself may not have mounted.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [autoReloading, setAutoReloading] = useState(false);

  useEffect(() => {
    const KEY = "circadium.autoReloadedAt";
    const now = Date.now();
    const last = Number(sessionStorage.getItem(KEY) ?? "0");
    // Auto-reload at most once per 20s so a persistent (non-transient) error
    // can't trap the tab in a reload loop.
    if (now - last > 20_000) {
      sessionStorage.setItem(KEY, String(now));
      setAutoReloading(true);
      window.location.reload();
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#0f1115",
          color: "#e7e9ee",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
            {autoReloading ? "Reconnecting…" : "Something went wrong"}
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              opacity: 0.75,
              margin: "0 0 20px",
            }}
          >
            Circadium is waking up. This usually clears in a moment.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              fontSize: 14,
              fontWeight: 600,
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              background: "#e7e9ee",
              color: "#0f1115",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
