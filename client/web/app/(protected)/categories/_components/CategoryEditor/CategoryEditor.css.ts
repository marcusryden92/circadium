import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media, radii } from "@/lib/theme/scales";
import { iconBtn } from "@/lib/theme/recipes.css";
import { display, text, fieldLabel as fieldLabelText } from "@/lib/theme/typography.css";
import { themeTransition, interactiveTransition } from "@/lib/theme/transitions";


export const editor = style({
  display: "flex",
  flexDirection: "column",
  gap: space["6"],
  padding: "20px 28px 28px",
  overflow: "auto",
  flex: 1,
  minHeight: 0,
  "@media": {
    [media.mobile]: {
      padding: "16px 16px 24px",
      gap: space["4"],
    },
  },
});

export const header = style({
  display: "flex",
  alignItems: "center",
  gap: space["4"],
  paddingBottom: space["4"],
  borderBottom: `1px solid ${vars.rule}`,
  transition: themeTransition,
});

export const headerActions = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  flexShrink: 0,
});

export const headerSwatch = style({
  width: 52,
  height: 52,
  borderRadius: radii["md+2"],
  border: `1px solid ${vars.glass.stroke}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: vars.font.display,
  fontSize: 24,
  fontWeight: 500,
  color: vars.textOnAccent,
  flexShrink: 0,
  textShadow: "0 1px 2px rgba(0,0,0,0.18)",
});

export const headerInfo = style({
  flex: 1,
  minWidth: 0,
});

// Shared geometry so static <-> edit doesn't shift the surrounding layout.
const NAME_LINE_HEIGHT = 32;
const NAME_BORDER = 2;

export const headerNameRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  minWidth: 0,
});

export const headerName = style([
  display.pageTitle,
  {
    color: vars.ink,
    lineHeight: `${NAME_LINE_HEIGHT}px`,
    margin: 0,
    padding: 0,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    height: NAME_LINE_HEIGHT,
    boxSizing: "content-box",
    // Transparent border-bottom reserves the same vertical space the editing
    // input's accent underline occupies, so swapping in/out doesn't pop layout.
    borderBottom: `${NAME_BORDER}px solid transparent`,
    cursor: "text",
    transition: themeTransition,
  },
]);

// The <Input variant="titleInline"> supplies the accent underline + box reset;
// this layers the page-title typography and the height matched to headerName so
// toggling rename in/out doesn't shift layout.
export const headerNameInput = style([
  display.pageTitle,
  {
    lineHeight: `${NAME_LINE_HEIGHT}px`,
    flex: 1,
    minWidth: 0,
    display: "block",
    height: NAME_LINE_HEIGHT,
  },
]);

export const headerNamePencil = style([
  iconBtn(),
  {
    color: vars.muted,
    opacity: 0,
    transition: interactiveTransition("opacity", "color", "background-color"),
    selectors: {
      [`${headerNameRow}:hover &`]: { opacity: 1 },
      "&:focus-visible": { opacity: 1 },
    },
  },
]);

export const headerSummary = style([
  text.bodySm,
  {
    marginTop: space["1.5"],
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

export const sectionTitle = style([
  display.listTitle,
  {
    color: vars.ink,
    marginBottom: space["3.5"],
    transition: themeTransition,
  },
]);

export const section = style({
  display: "flex",
  flexDirection: "column",
});

export const sectionPair = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: space["8"],
  "@media": {
    [media.mobile]: { gridTemplateColumns: "1fr", gap: space["6"] },
    // A landscape phone is wide, not narrow — restore the two-column pair so
    // the editor sheet doesn't stretch viewport-wide with a long scroll.
    [media.landscapePhone]: { gridTemplateColumns: "1fr 1fr", gap: space["8"] },
  },
});

export const fieldGrid = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "18px 26px",
  "@media": {
    [media.mobile]: { gridTemplateColumns: "1fr" },
    [media.landscapePhone]: { gridTemplateColumns: "1fr 1fr" },
  },
});

export const strictRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["3"],
});

export const strictToggle = style({
  display: "inline-flex",
  width: 38,
  height: 22,
  border: `1px solid ${vars.glass.stroke}`,
  borderRadius: radii.pill,
  background: `color-mix(in srgb, ${vars.ink} 6%, transparent)`,
  cursor: "pointer",
  padding: space["0.5"],
  alignItems: "center",
  flexShrink: 0,
  transition: themeTransition,
  appearance: "none",
  selectors: {
    "&[data-on='true']": {
      background: vars.ink,
      borderColor: vars.ink,
    },
  },
});

export const strictToggleThumb = style({
  width: 16,
  height: 16,
  borderRadius: radii.pill,
  background: vars.paper,
  transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  selectors: {
    [`${strictToggle}[data-on='true'] &`]: {
      transform: "translateX(16px)",
    },
  },
});

export const strictLabel = style([
  text.row,
  {
    fontWeight: 600,
    color: vars.ink,
    transition: themeTransition,
  },
]);

export const sectionHelp = style([
  text.bodySm,
  {
    marginTop: space["2.5"],
    color: vars.inkSoft,
    lineHeight: 1.5,
    transition: themeTransition,
  },
]);

export const windowsSubsection = style({
  marginBottom: space["5"],
});

export const subsectionLabel = style([
  fieldLabelText,
  {
    marginBottom: space["2"],
    display: "block",
    transition: themeTransition,
  },
]);

export const classificationNote = style([
  text.bodySm,
  {
    padding: "14px 16px",
    border: `1px dashed ${vars.rule}`,
    borderRadius: radii.md,
    background: vars.glass.bgSoft,
    color: vars.inkSoft,
    lineHeight: 1.5,
    transition: themeTransition,
  },
]);

export const windowsActions = style({
  display: "flex",
  justifyContent: "flex-end",
  marginTop: space["2.5"],
});

export const subCategoriesList = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
});

export const subCategoryRow = style([
  text.body,
  {
    display: "grid",
    gridTemplateColumns: "14px 1fr 130px 90px",
    alignItems: "center",
    gap: space["3"],
    "@media": {
      [media.mobile]: {
        gridTemplateColumns: "14px 1fr auto auto",
        gap: space["2"],
      },
    },
    padding: "8px 12px",
    border: `1px solid ${vars.rule}`,
    borderRadius: radii["sm+2"],
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: vars.ink,
    transition: themeTransition,
    selectors: {
      "&:hover": {
        background: vars.interactive.hoverFill,
        borderColor: vars.glass.stroke,
      },
    },
  },
]);

export const subCategoryDot = style({
  width: 9,
  height: 9,
  borderRadius: radii.pill,
  flexShrink: 0,
});

export const subCategoryName = style({
  fontWeight: 600,
  color: vars.ink,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const subCategoryMeta = style([
  text.label,
  {
    color: vars.muted,
    fontVariantNumeric: "tabular-nums",
    transition: themeTransition,
  },
]);

// Repeated inline-flex layout for combobox option rows (dot/icon + label).
export const inlineRow = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["2"],
});

export const inlineRowTight = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
});

export const parentOptionDot = style({
  width: 9,
  height: 9,
  borderRadius: radii.pill,
  flexShrink: 0,
});

export const lockIcon = style({
  color: vars.muted,
  opacity: 0.5,
  selectors: {
    "&[data-on='true']": {
      color: vars.accent.primary,
      opacity: 1,
    },
  },
});

export const subCategoryChevron = style({
  color: vars.muted,
  justifySelf: "end",
});

export const emptyEditor = style([
  text.bodyLg,
  {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: "60px 24px",
    color: vars.muted,
    textAlign: "center",
  },
]);

export const exceptionsBlock = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: space["2"],
  marginTop: space["4"],
});
