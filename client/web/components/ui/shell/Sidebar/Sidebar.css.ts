import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { radii, space } from "@/lib/theme/scales";
import { popover } from "@/lib/theme/recipes.css";
import { collapseTransition, buttonTransition, DURATIONS } from "@/lib/theme/transitions";

export const sidebar = style({
  flexShrink: 0,
  boxShadow: `1px 0 0 ${vars.rule}`,
  background: vars.surface.sidebar,
  // 15 centers the 30px icon column in the 60px collapsed rail; no token is 15.
  // eslint-disable-next-line theme/no-raw-scale-values
  padding: "15px",
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
  position: "relative",
  zIndex: 2,
  width: 208,
  transition: collapseTransition,
  selectors: {
    '&[data-collapsed="true"]': {
      width: 60,
    },
  },
});

export const brand = style({
  padding: "0 0 5px",
  display: "flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  overflow: "hidden",
});

export const navItem = style({
  height: 30,
  margin: 0,
  padding: 0,
  display: "flex",
  alignItems: "center",
  borderRadius: radii.pill,
  textAlign: "left",
  background: "transparent",
  border: "none",
  color: vars.inkSoft,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: vars.font.ui,
  cursor: "pointer",
  whiteSpace: "nowrap",
  textDecoration: "none",
  flexShrink: 0,
  transition: buttonTransition,
  selectors: {
    "&:hover": {
      background: vars.interactive.hoverFill,
      color: vars.ink,
    },
  },
});

export const navItemActive = style({
  background: vars.glass.bgDeep,
  color: vars.ink,
  fontWeight: 600,
  boxShadow: `inset 0 0 0 1px ${vars.glass.stroke}, inset 0 1px 0 ${vars.glass.hi}`,
});

export const navGlyph = style({
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 20,
  lineHeight: 1,
  flexShrink: 0,
});

export const navLabel = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  flex: 1,
  minWidth: 0,
  maxWidth: "100%",
  paddingLeft: space["3"],
  boxSizing: "border-box",
  transition: collapseTransition,
  selectors: {
    '[data-collapsed="true"] &': {
      maxWidth: 0,
      opacity: 0,
    },
  },
});

export const spacer = style({ flex: 1 });

export const navDivider = style({
  height: 1,
  background: vars.rule,
  flexShrink: 0,
});

export const footerRow = style({
  padding: "12px 0 0",
  // Reset button borders explicitly per side so the top divider survives â€” a
  // shorthand `border: "none"` would clobber the borderTop set below.
  borderRight: "none",
  borderBottom: "none",
  borderLeft: "none",
  borderTop: `1px solid ${vars.rule}`,
  display: "flex",
  alignItems: "center",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  width: "100%",
  textAlign: "left",
  transition: buttonTransition,
});

export const userMenu = style([
  popover({ size: "md" }),
  {
    // Mounted on document.body via createPortal so the sidebar's own
    // backdrop-filter can't trap the blur in a child stacking context.
    // top/left are set inline from the trigger's viewport rect; the transform
    // shifts the menu up by its own height minus 20px so the bottom edge dips
    // 20px into the footer button, giving the diagonal overlap effect.
    position: "fixed",
    transform: "translateY(calc(-100% + 20px))",
    width: 200,
    display: "flex",
    flexDirection: "column",
    padding: space["1.5"],
    zIndex: 100,
  },
]);

export const userMenuItem = style({
  display: "flex",
  alignItems: "center",
  gap: space["2.5"],
  padding: "8px 10px",
  border: "none",
  borderRadius: radii.sm,
  background: "transparent",
  color: vars.ink,
  fontFamily: vars.font.ui,
  fontSize: 13,
  fontWeight: 500,
  textAlign: "left",
  cursor: "pointer",
  textDecoration: "none",
  transition: buttonTransition,
  selectors: {
    "&:hover": { background: vars.interactive.hoverFill },
  },
});

export const userMenuItemDanger = style({
  color: vars.status.error,
});

export const userMenuIcon = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 14,
  flexShrink: 0,
});

export const avatar = style({
  width: 30,
  height: 30,
  borderRadius: radii.pill,
  background: `linear-gradient(135deg, ${vars.accent.secondary}, ${vars.accent.primary})`,
  display: "grid",
  placeItems: "center",
  fontSize: 13,
  fontWeight: 700,
  color: vars.ink,
  flexShrink: 0,
  boxShadow: `inset 0 1px 0 ${vars.glass.hi}`,
});

export const footerText = style({
  lineHeight: 1.1,
  overflow: "hidden",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
  maxWidth: "100%",
  paddingLeft: space["3"],
  boxSizing: "border-box",
  transition: collapseTransition,
  selectors: {
    '[data-collapsed="true"] &': {
      maxWidth: 0,
      opacity: 0,
    },
  },
});

export const footerName = style({
  fontSize: 13,
  fontWeight: 600,
  color: vars.ink,
  fontFamily: vars.font.ui,
});

export const collapseChevronIcon = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
  transition: `transform ${DURATIONS.collapse}s ease`,
  selectors: {
    '[data-collapsed="true"] &': {
      transform: "rotate(180deg)",
    },
  },
});
