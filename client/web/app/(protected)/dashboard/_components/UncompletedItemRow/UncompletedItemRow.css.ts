import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media } from "@/lib/theme/scales";
import {
  agendaTime,
  agendaDur,
  agendaTitle,
  agendaMeta,
} from "../agendaRow.css";

export const uncompletedDaysLabel = style({
  color: vars.status.success,
});

// lucide renders `size` as width/height attributes on the <svg>; a CSS rule
// overrides those, so this bumps both action-button icons up on mobile where
// the buttons go full-width and can carry a larger glyph.
export const actionIcon = style({
  "@media": {
    [media.mobile]: {
      width: 16,
      height: 16,
    },
  },
});

// On mobile the action buttons drop their labels (mobileGuard) and collapse to
// square icons, so time, title, and actions all fit on one row.
export const uncompletedRow = style({
  "@media": {
    [media.mobile]: {
      gridTemplateColumns: "72px 1fr auto",
      gridTemplateAreas: '"time content actions"',
    },
  },
});

export const mobileButton = style({
  "@media": {
    [media.mobile]: {
      flex: "0 !important",
      aspectRatio: "1/1",
    },
  },
});

globalStyle(`${uncompletedRow} > :nth-child(1)`, {
  "@media": {
    [media.mobile]: { gridArea: "time" },
  },
});

globalStyle(`${uncompletedRow} > :nth-child(2)`, {
  "@media": {
    [media.mobile]: { gridArea: "content" },
  },
});

export const uncompletedActions = style({
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "center",
  gap: space["2"],
  "@media": {
    [media.mobile]: {
      gridArea: "actions",
    },
  },
});

// 500ms confirmation flash on the row before Complete/Postpone fires.
// Complete uses success (green), Postpone uses info (blue). Overrides the
// default themeTransition (300ms) with a snappy 80ms so the tint pops in
// crisply instead of fading; the hover selector mirrors the flash bg so it
// stays solid while the cursor is still over the row. No border override —
// row keeps its transparent base border.
const FLASH_TRANSITION = "background-color 80ms ease";

export const uncompletedRowFlashSuccess = style({
  background: `color-mix(in srgb, ${vars.status.success} 55%, transparent)`,
  transition: FLASH_TRANSITION,
  selectors: {
    "&:hover": {
      background: `color-mix(in srgb, ${vars.status.success} 55%, transparent)`,
    },
  },
});

export const uncompletedRowFlashInfo = style({
  background: `color-mix(in srgb, ${vars.status.info} 55%, transparent)`,
  transition: FLASH_TRANSITION,
  selectors: {
    "&:hover": {
      background: `color-mix(in srgb, ${vars.status.info} 55%, transparent)`,
    },
  },
});

// While the row is flashing, force the text content to white so the row
// reads cleanly in light mode (otherwise the muted/ink colors are black on
// a saturated tint). Buttons keep their own pillBtn styling — they sit
// inside the uncompletedActions wrapper which isn't in the selector list.
const FLASH_SELECTORS = [uncompletedRowFlashSuccess, uncompletedRowFlashInfo]
  .flatMap((cls) => [
    `.${cls} .${agendaTime}`,
    `.${cls} .${agendaDur}`,
    `.${cls} .${agendaTitle}`,
    `.${cls} .${agendaMeta}`,
    `.${cls} .${agendaMeta} *`,
    `.${cls} .${uncompletedDaysLabel}`,
    `.${cls} .${uncompletedActions} button`,
    `.${cls} .${uncompletedActions} button *`,
  ])
  .join(", ");

globalStyle(FLASH_SELECTORS, {
  color: vars.textOnAccent,
  transition: "color 80ms ease",
});
