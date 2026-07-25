import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";

// Layout-only — the popover() recipe owns the glass surface (fill, blur,
// stroke, shadow, radius). This class adds the calendar-popover-specific
// fixed positioning, sizing limits, font, and viewport guards. The content
// scaffold (header, title row, body, footer) lives in the shared primitives
// under components/events/popover/. Mobile presents through the shared
// BottomSheet instead of this anchored box.
export const calendarPopover = style({
  position: "fixed",
  maxWidth: "calc(100vw - 20px)",
  maxHeight: "calc(100vh - 20px)",
  zIndex: 50,
  overflow: "hidden",
  fontFamily: vars.font.ui,
  color: vars.ink,
});
