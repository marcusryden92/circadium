import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, contentWidth, media, zIndex } from "@/lib/theme/scales";
import { display, text } from "@/lib/theme/typography.css";
import { colorMixAlpha } from "@/lib/theme/effects";

const spin = keyframes({ to: { transform: "rotate(360deg)" } });

// Opaque, AppShell-constrained panel: mounted inside the shell canvas (as an
// overlaySlot) so it clips to the canvas rounding and covers the sidebar too,
// but stays within the bezel. Reads as one solid surface like the assistant /
// WeekStructureModal — no glass, no header.
export const overlayRoot = style({
  position: "absolute",
  inset: 0,
  zIndex: zIndex.modal,
  background: vars.paper,
  // Full-bleed, non-scrolling: this is the layer the Backdrop/Grain cover
  // edge to edge. Scrolling lives on overlayScroll so its reserved scrollbar
  // gutter doesn't carve a bare strip out of those inset:0 decorative layers.
  overflow: "hidden",
});

export const overlayScroll = style({
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: space["6"],
  overflowY: "auto",
  // Reserve the scrollbar track even while it's hidden so content doesn't
  // shift sideways the moment a step grows past the fold. Transparent layer,
  // so the gutter reveals the Backdrop/Grain beneath rather than bare paper.
  scrollbarGutter: "stable",
  "@media": {
    [media.mobile]: {
      padding: space["4"],
      // Stretch the frame to fill the overlay so each step's footer pins to
      // the bottom instead of floating under short content. A step taller than
      // the viewport still grows and scrolls from here.
      alignItems: "stretch",
    },
  },
});

export const frameWrap = style({
  position: "relative",
  zIndex: 1,
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  "@media": {
    [media.mobile]: {
      alignItems: "stretch",
    },
  },
});

// The step content sits directly on the panel (the surface is the overlay
// itself), so this is a plain centered column — no card fill, border, or
// shadow.
export const card = style({
  width: "100%",
  maxWidth: contentWidth.sm,
  height: "min(88vh, 860px)",
  display: "flex",
  flexDirection: "column",
  gap: space["5"],
  padding: space["8"],
  "@media": {
    [media.mobile]: {
      // The overlay scrolls from flex-start on mobile and the soft keyboard
      // fights a fixed height, so let the card size to its content there.
      height: "auto",
      padding: 0,
      gap: space["4"],
    },
  },
});

// Wide layout for the embedded AI step — the assistant needs a split-pane
// canvas, so this frame breaks out of the narrow form width.
export const cardWide = style({
  maxWidth: contentWidth.xl,
  width: "100%",
  padding: space["5"],
  gap: space["3"],
  "@media": {
    [media.mobile]: {
      height: "100%",
      padding: 0,
    },
  },
});

export const aiWorkspace = style({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  borderRadius: radii.xl,
  overflow: "hidden",
  border: `1px solid ${vars.glass.stroke}`,
});

export const topRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["3"],
});

export const progress = style({
  display: "flex",
  gap: space["1.5"],
  flex: 1,
});

export const segment = style({
  height: 4,
  flex: 1,
  borderRadius: radii.pill,
  background: vars.rule,
  transition: "background 200ms ease",
});

export const segmentFilled = style({
  background: vars.accent.primary,
});

export const skipLink = style([
  text.body,
  {
    appearance: "none",
    border: "none",
    background: "transparent",
    color: vars.muted,
    cursor: "pointer",
    padding: `${space["1"]}px ${space["2"]}px`,
    borderRadius: radii.sm,
    selectors: {
      "&:hover:not(:disabled)": {
        color: vars.ink,
        background: vars.interactive.hoverFill,
      },
      "&:disabled": { opacity: 0.5, cursor: "default" },
    },
  },
]);

export const title = style([
  display.statCard,
  {
    lineHeight: 1.15,
    color: vars.ink,
    margin: 0,
    "@media": {
      [media.mobile]: { fontSize: 22 },
    },
  },
]);

export const subtitle = style([
  text.bodyLg,
  {
    lineHeight: 1.5,
    color: vars.muted,
    margin: 0,
    marginTop: space["1.5"],
  },
]);

export const body = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  // Same rationale as overlayRoot: adding a jot or a location row must not
  // pop a scrollbar in and reflow the whole step.
  scrollbarGutter: "stable",
  display: "flex",
  flexDirection: "column",
  gap: space["4"],
});

export const footer = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["3"],
  marginTop: "auto",
});

export const footerActions = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  marginLeft: "auto",
});

// Welcome
export const welcomeCenter = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: space["4"],
  paddingBlock: space["4"],
  // Body is a flex column with fixed height now; center the wordmark in it.
  marginBlock: "auto",
});

export const tagline = style([
  text.bodyLg,
  {
    lineHeight: 1.55,
    color: vars.muted,
    maxWidth: 420,
    margin: 0,
  },
]);

// Roles picker — two columns (suggestions / selected), CategoryBadge tint
export const roleColumns = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: space["4"],
  "@media": {
    [media.mobile]: {
      gridTemplateColumns: "1fr",
      gap: space["4"],
    },
  },
});

export const roleColumn = style({
  display: "flex",
  flexDirection: "column",
  // Rows size to their content, not the full column width, so a role reads
  // as a compact badge instead of a full-width bar.
  alignItems: "flex-start",
  marginTop: space["2"],
  gap: space["2"],
  minWidth: 0,
  "@media": {
    [media.mobile]: {
      height: 240,
      overflowY: "auto",
    },
  },
});

export const roleColumnTitle = style([
  text.bodySm,
  {
    color: vars.muted,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
]);

// Same tint language as CategoryBadge (per-row color via the --role-color
// custom property) but at a readable size and in sentence case.
export const roleRow = style([
  text.row,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: space["2"],
    maxWidth: "100%",
    padding: `0px ${space["2"]}px`,
    borderRadius: radii.md,
    border: "1px solid var(--role-color)",
    background: `color-mix(in srgb, var(--role-color) ${colorMixAlpha.lightFill}%, transparent)`,
    color: vars.ink,
    cursor: "pointer",
    textAlign: "left",
    transition: "background 150ms ease",
    selectors: {
      "&:hover": {
        background: `color-mix(in srgb, var(--role-color) ${colorMixAlpha.hoverFill}%, transparent)`,
      },
    },
  },
]);

export const roleRowLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

// The selected list speaks the categories rail's reorder language instead of
// the tinted-chip look: full-width neutral rows with a color dot, hover fill,
// and 2px accent drop lines. The whole row is the drag handle. Rows stack
// tightly (rail-style) so the drop lines sit between neighbors, not in a gap.
export const roleSelectedList = style({
  display: "flex",
  flexDirection: "column",
  alignSelf: "stretch",
  gap: space["0.5"],
});

export const roleSelectedRow = style([
  text.row,
  {
    display: "flex",
    alignItems: "center",
    alignSelf: "stretch",
    gap: space["2"],
    padding: "5px 8px",
    borderRadius: radii.sm,
    color: vars.ink,
    cursor: "grab",
    selectors: {
      "&:hover": { background: vars.interactive.hoverFill },
      "&:active": { cursor: "grabbing" },
    },
  },
]);

export const roleDot = style({
  display: "inline-block",
  width: 9,
  height: 9,
  borderRadius: radii.pill,
  background: "var(--role-color)",
  flexShrink: 0,
});

export const roleRowDragging = style({
  opacity: 0.4,
});

// Drop-position indicators, mirroring the categories rail: a 2px accent line at
// the leading/trailing edge of the row the pointer would drop before/after.
export const roleRowDropBefore = style({
  boxShadow: `inset 0 2px 0 0 ${vars.accent.primary}`,
});

export const roleRowDropAfter = style({
  boxShadow: `inset 0 -2px 0 0 ${vars.accent.primary}`,
});

// Stays visible (not hover-revealed like the rail's add-child button) because
// removal must remain reachable on touch, where hover doesn't exist.
export const roleRowRemove = style({
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: space["0.5"],
  borderRadius: radii.xs,
  display: "inline-flex",
  flexShrink: 0,
  cursor: "pointer",
  color: vars.muted,
  selectors: {
    "&:hover": { color: vars.ink, background: vars.interactive.hoverFill },
  },
});

export const roleRowIcon = style({
  display: "inline-flex",
  flexShrink: 0,
  color: "var(--role-color)",
});

export const roleEmptyNote = style([
  text.body,
  {
    color: vars.muted,
    fontStyle: "italic",
    paddingBlock: space["2"],
  },
]);

export const customRow = style({
  display: "flex",
  gap: space["2"],
  alignItems: "center",
});

export const selectionCaption = style([text.body, { color: vars.muted }]);

// Brain dump — jotted rows, plain capture (the assistant does the triage)
export const dumpList = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
});

export const dumpRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  padding: `${space["2"]}px ${space["2.5"]}px`,
  borderRadius: radii.sm,
  border: `1px solid ${vars.glass.stroke}`,
  background: vars.glass.bgSoft,
});

export const dumpRowTitle = style([
  text.bodyLg,
  {
    flex: 1,
    minWidth: 0,
    color: vars.ink,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
]);

export const dumpRemove = style({
  appearance: "none",
  border: "none",
  background: "transparent",
  color: vars.muted,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  padding: space["1"],
  borderRadius: radii.sm,
  flexShrink: 0,
  selectors: {
    "&:hover": { color: vars.ink, background: vars.interactive.hoverFill },
  },
});

export const dumpEmpty = style([
  text.body,
  {
    color: vars.muted,
    fontStyle: "italic",
    paddingBlock: space["2"],
  },
]);

// Override layer for the boxed <Input>; appearance:none only strips native
// date/select chrome. The fill, stroke, and focus come from the component.
export const input = style({ appearance: "none" });

export const fieldStack = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
});

export const fieldLabel = style([text.body, { color: vars.ink }]);

export const fieldHelp = style([text.bodySm, { color: vars.muted }]);

// Week form
export const timeRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
});

export const timeDash = style([text.body, { color: vars.muted }]);

// The location value rendered inside the Week step's Combobox — a MapPin icon
// beside the name.
export const locationOption = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1.5"],
});

export const dayToggles = style({
  display: "flex",
  gap: space["1.5"],
  flexWrap: "wrap",
  margin: `${space["3"]}px 0px`,
});

// Circular day dots that speak the app's toggle vocabulary: an unselected
// glass chip that reads as muted, selected as a solid ink pill (the same
// selected treatment as Switch's checked track and the SegmentedControl thumb).
export const dayToggle = style([
  text.bodySm,
  {
    width: 36,
    height: 36,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    border: `1px solid ${vars.glass.stroke}`,
    background: vars.glass.bgSoft,
    color: vars.muted,
    cursor: "pointer",
    transition:
      "background 150ms ease, color 150ms ease, border-color 150ms ease",
    selectors: {
      "&:hover": { background: vars.interactive.hoverFill, color: vars.ink },
    },
  },
]);

export const dayToggleOn = style({
  borderColor: vars.ink,
  background: vars.ink,
  color: vars.paper,
  selectors: {
    // Hold the selected look on hover rather than fading to the hover fill.
    "&:hover": { background: vars.ink, color: vars.paper },
  },
});

export const sectionToggleRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["3"],
  marginBottom: space["3"],
});

export const previewNote = style([
  text.body,
  {
    color: vars.muted,
    fontStyle: "italic",
    marginTop: space["2"],
  },
]);

// Places — multi-row location editor
export const locationRows = style({
  display: "flex",
  flexDirection: "column",
  gap: space["2"],
});

export const locationRow = style({
  display: "grid",
  gridTemplateColumns: "minmax(96px, 0.4fr) 1fr",
  gap: space["2"],
  alignItems: "start",
});

export const addressCell = style({
  position: "relative",
});

export const addressWrap = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
});

export const addressIcon = style({
  position: "absolute",
  left: space["3"],
  top: "50%",
  transform: "translateY(-50%)",
  color: vars.muted,
  display: "inline-flex",
  pointerEvents: "none",
});

// The MapPin icon (left) and spinner (right) need wide horizontal padding to
// clear them; the vertical rhythm comes from the shared scale="lg" both
// location inputs carry. `&&` beats the recipe's padding by specificity so the
// icons never sit on the text.
export const addressInput = style({
  selectors: {
    "&&": { paddingLeft: space["7"], paddingRight: space["7"] },
  },
});

export const addressSelected = style({
  borderColor: vars.accent.primary,
});

export const addressSpinner = style({
  position: "absolute",
  right: space["2.5"],
  color: vars.muted,
  display: "inline-flex",
  animation: `${spin} 0.8s linear infinite`,
});

export const errorText = style([text.body, { color: vars.status.error }]);
