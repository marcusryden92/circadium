import { style } from "@vanilla-extract/css";
import { media } from "@/lib/theme/scales";

export const card = style({
  display: "flex",
  flexDirection: "column",
});

export const cardBody = style({
  padding: "12px 0",
});

export const fieldGrid = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "13px 22px",
  "@media": {
    [media.mobile]: { gridTemplateColumns: "1fr" },
  },
});

// Category + color stay paired on mobile too — both controls are narrow
// pills, and the single-column stack wasted a full row on each.
export const doubleGrid = style({
  display: "grid",
  gridTemplateColumns: "2fr 1fr",
  gap: "5px 22px",
  "@media": {
    [media.mobile]: { gap: "5px 12px" },
  },
});

// Splitting (task), Repeats (plan), and DailyLimit (goal root) are mutually
// exclusive; AllowedTimes co-renders with them for tasks and goals. Each
// renders as a one-line summary row whose editor opens in a popover, so the
// slot height depends only on the row count, never on editor state. The
// min-height reserves the two-row footprint so retyping to plan (one row)
// doesn't shift anything below the card.
export const rulesSlot = style({
  gridColumn: "1 / -1",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  minHeight: 76,
});
