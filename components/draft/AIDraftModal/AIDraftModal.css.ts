import { createVar, style, globalStyle } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii, zIndex, media } from "@/lib/theme/scales";
import { display, text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const MODAL_FADE_MS = 220;

// Fills the AppShell canvas (the assistantSlot mounts as a canvas child), so
// it covers the sidebar and mobile tabs — route changes underneath got messy
// — while clipping to the shell's rounded frame. Still below the
// Capture/Search palettes (zIndex.palette) and confirms.
export const overlay = style({
  position: "absolute",
  inset: 0,
  zIndex: zIndex.floating,
  display: "flex",
  opacity: 0,
  transition: `opacity ${MODAL_FADE_MS}ms ease`,
  selectors: {
    "&[data-state='open']": { opacity: 1 },
  },
});

export const modal = style({
  position: "absolute",
  inset: 0,
  zIndex: zIndex.floating + 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  isolation: "isolate",
  padding: 0,
  background: vars.paper,
  opacity: 0,
  transform: "translateY(8px) scale(0.995)",
  transition: `${themeTransition}, opacity ${MODAL_FADE_MS}ms ease, transform ${MODAL_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
  selectors: {
    "&[data-state='open']": {
      opacity: 1,
      transform: "translateY(0) scale(1)",
    },
  },
});

// Embedded mode (onboarding AI step): fills its parent container instead of
// the app main column, with no Dialog overlay/animation. The host provides its
// own framing and save action.
export const embeddedRoot = style({
  position: "relative",
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  isolation: "isolate",
  background: vars.paper,
});

export const banner = style({
  position: "relative",
  zIndex: 1,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: space["3.5"],
  padding: "8px 22px",
  background: vars.ink,
  color: vars.paper,
  transition: themeTransition,
});

export const editingLabel = style([
  fieldLabel,
  {
    transition: themeTransition,
    // fieldLabel bundles color: vars.muted; a doubled selector outranks that
    // single-class preset so paper wins on the dark ink banner, order-safe.
    selectors: {
      "&&": { color: vars.paper },
    },
  },
]);

export const bannerSpacer = style({ flex: 1 });

export const cancelButtonStyle = style({
  // Beat pillBtn's ghost `color: vars.inkSoft` (which matches the ink banner
  // background in both themes) via a doubled selector — order-independent.
  selectors: {
    "&&": { color: vars.paper },
    "&&:hover:not(:disabled)": { color: vars.paper },
  },
});

export const body = style({
  position: "relative",
  zIndex: 1,
  flex: 1,
  display: "flex",
  minHeight: 0,
  overflow: "hidden",
});

// Mobile shows one pane at a time — this row hosts the Chat / Review
// segmented switch. Hidden on wider layouts where both panes render
// side by side.
export const mobilePaneSwitch = style({
  display: "none",
  "@media": {
    [media.mobile]: {
      display: "flex",
      flexShrink: 0,
      padding: "10px 14px 0",
    },
  },
});

globalStyle(`${mobilePaneSwitch} > *`, {
  flex: 1,
});

export const paneMobileHidden = style({
  "@media": {
    [media.mobile]: {
      display: "none",
    },
  },
});

// Set inline (via assignInlineVars) from the divider drag; a var instead of an
// inline flex style so the mobile media query below can still win.
export const chatBasisVar = createVar();

export const chatPane = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  minWidth: 240,
  flex: `0 0 ${chatBasisVar}`,
  padding: "14px 18px",
  // Subtle darker surface behind the chat — makes the assistant text and
  // composer sit on a differentiated surface without breaking the modal's
  // paper theme. Auto-adapts per light/dark: in light mode we tint toward
  // ink, in dark mode this reads as a slightly deeper paper.
  background: `color-mix(in srgb, ${vars.ink} 4%, ${vars.paper})`,
  transition: themeTransition,
  "@media": {
    [media.tablet]: {
      minWidth: 180,
    },
    [media.mobile]: {
      minWidth: 0,
      flex: "1 1 auto",
      // Composer sits at the very bottom of the modal on mobile (nothing below
      // it). Clear the home-indicator safe area so the text box is reachable.
      padding: "10px 14px calc(16px + env(safe-area-inset-bottom, 0px))",
    },
  },
});

export const treePane = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  minWidth: 240,
  flex: "1 1 0",
  padding: "14px 18px",
  "@media": {
    [media.tablet]: {
      minWidth: 180,
    },
    [media.mobile]: {
      minWidth: 0,
      padding: "10px 14px calc(16px + env(safe-area-inset-bottom, 0px))",
    },
  },
});

// Drag handle between the two panes. Thin bar with a wider hover target and
// a col-resize cursor. Sits inside `.body` (which is display: flex). On
// mobile only one pane shows at a time, so the handle goes away.
export const paneDivider = style({
  position: "relative",
  flex: "0 0 4px",
  cursor: "col-resize",
  touchAction: "none",
  background: vars.rule,
  transition: themeTransition,
  selectors: {
    "&:hover, &[data-dragging='true']": {
      background: vars.accent.primary,
    },
  },
  "@media": {
    [media.mobile]: {
      display: "none",
    },
  },
});

export const paneHeader = style({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  alignItems: "baseline",
  marginBottom: space["1"],
  padding: `0 ${space["2"]}px`,
  flexShrink: 0,
});

// A left-aligned group with a fixed gap: space-between reads fine at middling
// widths but scatters five tabs across the whole pane at large scale. Wraps
// when the pane is dragged narrow instead of overflowing.
export const paneHeaderSection = style({
  display: "flex",
  alignItems: "baseline",
  width: "100%",
  flexWrap: "wrap",
  columnGap: space["5"],
  rowGap: space["1"],
  paddingBottom: space["1"],
  flexShrink: 0,
});

// Horizontal padding 0 so the status label and actions share the tab labels'
// left edge — the two rows read as one header block.
export const paneSubheaderSection = style({
  display: "flex",
  alignItems: "baseline",
  padding: `${space["0.5"]}px 0`,
  width: "100%",
  gap: space["3"],
  flexShrink: 0,
});

export const paneTitle = style([
  display.modalTitle,
  {
    color: vars.ink,
    margin: 0,
    transition: themeTransition,
  },
]);

export const paneSubtitle = style([
  text.label,
  {
    color: vars.inkSoft,
    fontVariantNumeric: "tabular-nums",
  },
]);

// Goals / Week tab buttons in the tree pane header. The active tab reads as
// the pane title; inactive tabs recede to muted and invite the switch.
export const paneTab = style({
  appearance: "none",
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "baseline",
  gap: space["1.5"],
  color: vars.muted,
  transition: themeTransition,
  selectors: {
    "&[data-active='true']": {
      color: vars.ink,
    },
    "&:hover:not([data-active='true'])": {
      color: vars.inkSoft,
    },
  },
});

// paneTitle's look with the color left to the tab button, so active/inactive
// states cascade.
export const paneTabLabel = style([
  display.modalTitle,
  {
    color: "inherit",
    margin: 0,
    transition: themeTransition,
  },
]);

// Mobile replaces the tab buttons with a native select dressed as the pane
// title (same display face the active tab uses on desktop), so switching
// domains is one tap into the platform picker.
export const mobileTabSelectRow = style({
  display: "flex",
  alignItems: "center",
  width: "100%",
  gap: space["2"],
  paddingBottom: space["1"],
});

export const mobileTabSelectWrap = style({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  minWidth: 0,
});

export const mobileTabSelect = style([
  display.modalTitle,
  {
    appearance: "none",
    WebkitAppearance: "none",
    background: "transparent",
    border: "none",
    margin: 0,
    padding: 0,
    paddingRight: 22,
    color: vars.ink,
    cursor: "pointer",
    maxWidth: "100%",
    textOverflow: "ellipsis",
    transition: themeTransition,
  },
]);

export const mobileTabSelectChevron = style({
  position: "absolute",
  right: 0,
  top: "50%",
  transform: "translateY(-50%)",
  pointerEvents: "none",
  color: vars.inkSoft,
});

// Sum of pending changes across every tab — visible even when the selected
// domain itself is clean, so the dropdown never hides work elsewhere.
export const mobileTotalChanges = style([
  text.microLabel,
  {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: space["1"],
    color: vars.inkSoft,
    whiteSpace: "nowrap",
  },
]);

export const tabChangeCount = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 16,
  height: 16,
  padding: "0 4px",
  borderRadius: radii.pill,
  fontFamily: vars.font.ui,
  fontSize: 10,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: vars.textOnAccent,
  background: vars.accent.primary,
  transform: "translateY(-1px)",
  transition: themeTransition,
});

// Right-aligned group of header actions (history, "New chat", "Show all").
export const headerActionCluster = style({
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: space["1"],
});

// Small action button in a pane header ("Show all", "New chat", "History").
export const headerActionButton = style([
  text.microLabel,
  {
    appearance: "none",
    background: "transparent",
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: space["1"],
    borderRadius: radii.sm,
    cursor: "pointer",
    fontWeight: 600,
    color: vars.inkSoft,
    whiteSpace: "nowrap",
    transition: themeTransition,
    selectors: {
      "&:hover": {
        background: vars.interactive.hoverFill,
        color: vars.ink,
      },
    },
  },
]);

export const chatPlaceholder = style([
  text.bodySm,
  {
    flex: 1,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: space["6"],
    borderRadius: radii["md+2"],
    border: `1px dashed ${vars.rule}`,
    color: vars.muted,
    textAlign: "center",
  },
]);

export const a11yHiddenTitle = style({
  position: "absolute",
  left: -10000,
});
