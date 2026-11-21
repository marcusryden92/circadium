import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, borderWidth } from "@/lib/theme/scales";
import { colorMixAlpha } from "@/lib/theme/effects";

export const addForm = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
});

export const addRow = style({
  display: "flex",
  gap: space["2"],
  alignItems: "center",
  flexWrap: "wrap",
});

export const urlInputWrap = style({
  flex: "1 1 260px",
  minWidth: 0,
});

export const nameInputWrap = style({
  flex: "0 1 180px",
  minWidth: 0,
});

export const sourceList = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
});

export const sourceRow = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
  padding: `${space["2.5"]}px ${space["3"]}px`,
  borderRadius: radii.md,
  border: `${borderWidth.hairline}px solid ${vars.rule}`,
  background: `color-mix(in srgb, ${vars.ink} 3%, transparent)`,
});

export const sourceHead = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  minWidth: 0,
});

export const sourceName = style({
  fontWeight: 600,
  fontSize: 13.5,
  color: vars.ink,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
});

export const sourceUrl = style({
  fontSize: 11,
  color: vars.muted,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
});

export const sourceMeta = style({
  fontSize: 11,
  color: vars.muted,
});

export const sourceError = style({
  fontSize: 11,
  color: vars.status.error,
});

export const sourceControls = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  flexWrap: "wrap",
});

export const controlSpacer = style({
  flex: 1,
});

export const enabledLabel = style({
  display: "flex",
  alignItems: "center",
  gap: space["1.5"],
  fontSize: 12,
  color: vars.inkSoft,
});

export const disabledNote = style({
  opacity: 0.55,
});

export const emptyNote = style({
  fontSize: 12.5,
  color: vars.muted,
  padding: `${space["2"]}px 0`,
});

export const removeBtnDanger = style({
  color: vars.status.error,
  selectors: {
    "&:hover": {
      background: `color-mix(in srgb, ${vars.status.error} ${colorMixAlpha.subtleFill}%, transparent)`,
    },
  },
});

export const googleRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  flexWrap: "wrap",
  padding: `${space["2.5"]}px ${space["3"]}px`,
  borderRadius: radii.md,
  border: `${borderWidth.hairline}px solid ${vars.rule}`,
  background: `color-mix(in srgb, ${vars.ink} 3%, transparent)`,
});

export const googleLabel = style({
  display: "flex",
  flexDirection: "column",
  gap: space["0.5"],
  minWidth: 0,
  flex: 1,
});

export const googleTitle = style({
  fontWeight: 600,
  fontSize: 13,
  color: vars.ink,
});

export const googleHint = style({
  fontSize: 11,
  color: vars.muted,
});

export const calendarPickerList = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  paddingTop: space["1"],
});

export const calendarPickerRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: `${space["1.5"]}px ${space["2"]}px`,
  borderRadius: radii.sm,
  selectors: {
    "&:hover": {
      background: vars.interactive.hoverFill,
    },
  },
});

export const calendarDot = style({
  width: 10,
  height: 10,
  borderRadius: "50%",
  flexShrink: 0,
});

export const calendarPickerName = style({
  fontSize: 12.5,
  color: vars.ink,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
  flex: 1,
});

export const calendarPickerRole = style({
  fontSize: 10.5,
  color: vars.muted,
  flexShrink: 0,
});
