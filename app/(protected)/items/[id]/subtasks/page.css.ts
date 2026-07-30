import { style, globalStyle } from "@vanilla-extract/css";
import { media } from "@/lib/theme/scales";
import { DURATIONS } from "@/lib/theme/transitions";

export const layout = style({
  display: "flex",
  flexDirection: "row",
  width: "100%",
  flex: 1,
  minHeight: 0,
  gap: 0,
  "@media": {
    [media.mobile]: { flexDirection: "column", flex: "1 0 auto" },
  },
});

export const treePane = style({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
});

// Desktop-only side column — on mobile the drawer renders through the shared
// BottomSheet instead (in the stacked flow it would sit below the entire
// tree, off-screen from the row that was tapped).
export const drawerSlot = style({
  width: 0,
  flexShrink: 0,
  overflow: "hidden",
  transition: `width ${DURATIONS.collapse}s ease`,
});

export const drawerSlotOpen = style({
  width: 360,
});

// The drawer's own layout expects a bounded container to fill and scroll in;
// inside the content-sized sheet body it gets one explicitly.
export const drawerSheetFill = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  height: ["66vh", "66dvh"],
});

// The tree scrolls inside the height-locked tab frame on desktop, so the
// drawer column stays in view; on mobile the whole page scrolls instead.
export const card = style({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  scrollbarGutter: "stable",
  "@media": {
    [media.mobile]: {
      flex: "1 0 auto",
      minHeight: "auto",
      overflowY: "visible",
      scrollbarGutter: "auto",
    },
  },
});

export const legacyCardDisabled = style({
  opacity: 0.5,
  pointerEvents: "none",
});

export const cardBody = style({});

// When the subtask list wrapper renders null (no subtasks), AddSubtask is the
// only child â€” pin it to the bottom so the empty space sits above it rather
// than below.
globalStyle(`${cardBody} > :only-child`, {
  marginTop: "auto",
});
