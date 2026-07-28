import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, media } from "@/lib/theme/scales";
import { formInput, iconBtn } from "@/lib/theme/recipes.css";
import { display, text, fieldLabel as fieldLabelPreset } from "@/lib/theme/typography.css";
import { themeTransition, interactiveTransition } from "@/lib/theme/transitions";

const lockedShake = keyframes({
  "0%, 100%": { transform: "translateX(0)" },
  "20%, 60%": { transform: "translateX(-3px)" },
  "40%, 80%": { transform: "translateX(3px)" },
});

export const drawer = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3.5"],
  padding: "16px 18px",
  borderLeft: `1px solid ${vars.rule}`,
  background: vars.glass.bgSoft,
  borderBottomRightRadius: radii["lg+2"],
  height: "100%",
  minHeight: 0,
  overflow: "auto",
  transition: themeTransition,
  // Inside the mobile BottomSheet the side-column chrome comes off; the
  // sheet owns the border and radius.
  "@media": {
    [media.mobile]: {
      borderLeft: "none",
      borderBottomRightRadius: 0,
    },
  },
});

export const drawerHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});

export const drawerHeaderLabel = style([
  fieldLabelPreset,
  {
    transition: themeTransition,
  },
]);

export const drawerClose = iconBtn();

export const drawerBody = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3.5"],
  // Landscape phones: the sheet is short and viewport-wide, so pair the
  // fields into two columns instead of one long scroll.
  "@media": {
    [media.landscapePhone]: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      columnGap: space["10"],
      alignItems: "start",
    },
  },
});

// The <Input variant="titleInline"> supplies the accent underline + box reset;
// this layers the modal-title typography and a little vertical breathing room.
export const drawerTitleInput = style([
  display.modalTitle,
  {
    selectors: {
      "&&": { padding: "4px 0" },
    },
    "@media": {
      [media.landscapePhone]: { gridColumn: "1 / -1" },
    },
  },
]);

export const fieldLabel = style([
  fieldLabelPreset,
  {
    transition: themeTransition,
  },
]);

export const splitToggleRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  minHeight: 28,
});

export const splitHint = style([
  text.bodySm,
  {
    color: vars.muted,
    transition: themeTransition,
  },
]);

// Completion is a status block, not a form field — it leads the drawer and
// a bottom rule fences it off from the fields below.
export const completeSection = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
  paddingBottom: space["4"],
  borderBottom: `1px solid ${vars.rule}`,
  transition: themeTransition,
  // The bottom rule fences status from fields — keep it full-bleed when the
  // body pairs into landscape columns.
  "@media": {
    [media.landscapePhone]: { gridColumn: "1 / -1" },
  },
});

export const completeHeader = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
});

// Split items lead with logged progress instead of a completed-at date.
export const splitCompletedRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
});

export const splitCompletedNote = style([
  text.bodySm,
  {
    color: vars.inkSoft,
    transition: themeTransition,
  },
]);

// Sized just under the overview page's 22px completion checkbox so the two
// surfaces read as the same control at the drawer's denser scale.
export const completeCheckbox = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  borderRadius: radii.pill,
  border: `1.5px solid ${vars.muted}`,
  background: "transparent",
  color: vars.muted,
  cursor: "pointer",
  padding: 0,
  paddingLeft: space["1"],
  marginBottom: space["1"],
  // Snappier than the 1s themeTransition so click feedback feels immediate.
  transition: interactiveTransition(
    "background-color",
    "border-color",
    "color",
  ),
  selectors: {
    "&[data-completed='true']": {
      background: vars.status.success,
      borderColor: vars.status.success,
      color: vars.paper,
    },
    "&:hover": {
      borderColor: vars.ink,
    },
    "&[data-completed='true']:hover": {
      borderColor: vars.status.success,
      filter: "brightness(0.95)",
    },
    "&[data-locked='true']": { cursor: "not-allowed" },
    "&[data-shake='true']": {
      animation: `${lockedShake} 0.4s ease-in-out`,
      borderColor: vars.status.error,
      color: vars.status.error,
      background: "transparent",
    },
  },
});

export const dateInputFaded = style({
  opacity: 0.4,
  transition: "opacity 160ms ease",
});

export const notesInput = style([
  formInput({ variant: "boxed" }),
  {
    display: "block",
    minHeight: 72,
    resize: "vertical",
    lineHeight: 1.55,
    paddingTop: space["2"],
    paddingBottom: space["2"],
  },
]);

export const drawerFooter = style({
  display: "flex",
  position: "sticky",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["2"],
  marginTop: "auto",
  paddingTop: space["4"],
  borderTop: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const footerActionGroup = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
});
