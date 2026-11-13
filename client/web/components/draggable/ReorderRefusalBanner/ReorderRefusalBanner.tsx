"use client";

import { CircleSlash } from "lucide-react";
import { banner, icon } from "./ReorderRefusalBanner.css";

// Transient toast shown when a drag/reorder is refused by the precedence
// validator (a node-level dependency loop through goals' step orders). Owned
// and self-cleared by DraggableContextProvider.
export function ReorderRefusalBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className={banner} role="alert">
      <span className={icon} aria-hidden>
        <CircleSlash size={14} strokeWidth={2.2} />
      </span>
      <span>{message}</span>
    </div>
  );
}
