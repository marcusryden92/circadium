import { recipe } from "@vanilla-extract/recipes";
import { vars } from "./tokens.css";
import { backdropFilters } from "./effects";
import { themeTransition, buttonTransition } from "./transitions";
import { radii, space, borderWidth } from "./scales";

export const glass = recipe({
  base: {
    border: `1px solid ${vars.glass.stroke}`,
    background: vars.glass.bg,
    transition: themeTransition,
  },
  variants: {
    fill: {
      regular: { background: vars.glass.bg },
      deep: { background: vars.glass.bgDeep },
      soft: { background: vars.glass.bgSoft },
    },
    radius: {
      none: { borderRadius: 0 },
      sm: { borderRadius: radii.lg },
      md: { borderRadius: radii["lg+2"] },
      lg: { borderRadius: radii["xl+2"] },
      xl: { borderRadius: radii["2xl"] },
      canvas: { borderRadius: radii["3xl"] },
    },
    shadow: {
      panel: { boxShadow: vars.shadow.panel },
      panelSm: { boxShadow: vars.shadow.panelSm },
      none: { boxShadow: "none" },
    },
    // How the backdrop blur is attached to the surface.
    //   self   — backdrop-filter on the element itself. Default. Use for
    //            leaf surfaces (no nested element wants its own blur).
    //   pseudo — backdrop-filter on a ::before pseudo. Use when this
    //            surface contains a nested element that also has its
    //            own backdrop-filter (e.g. a pinned glass header inside
    //            a glass card). A parent's filter establishes a backdrop
    //            root that blocks descendant filters from sampling
    //            correctly; a pseudo has no descendants so it cannot
    //            block anything. See `glass({ blur: "pseudo" })` callers
    //            for the canonical use.
    //   none   — opt out entirely (e.g. surfaces that need to participate
    //            in a parent's blur sample without contributing one).
    blur: {
      self: {
        backdropFilter: backdropFilters.panel,
        WebkitBackdropFilter: backdropFilters.panel,
      },
      pseudo: {
        position: "relative",
        isolation: "isolate",
        selectors: {
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            zIndex: -1,
            borderRadius: "inherit",
            backdropFilter: backdropFilters.panel,
            WebkitBackdropFilter: backdropFilters.panel,
          },
        },
      },
      none: {},
    },
  },
  defaultVariants: {
    fill: "regular",
    radius: "lg",
    shadow: "none",
    blur: "self",
  },
});

export type GlassVariants = NonNullable<Parameters<typeof glass>[0]>;

// Canonical recipe for every floating surface in the app: small dropdowns,
// menus, mid-size popovers, and centered modals. Locks in the glass fill,
// blur, stroke, and transition so call sites can't drift; size variants
// bundle the radius + shadow pairing.
export const popover = recipe({
  base: {
    // surface.modal, not glass.bgDeep: a floating popover must occlude what's
    // behind it. In dark mode glass.bgDeep is a near-white brightening film at
    // ~9% alpha that reads as a ghost over busy content (the calendar), and
    // raising its alpha only marches it toward white. surface.modal is a dark,
    // mostly-opaque frosted base in dark mode and identical to glass.bgDeep in
    // light mode, so every tier stays legible without shifting light mode.
    background: vars.surface.modal,
    backdropFilter: backdropFilters.panel,
    WebkitBackdropFilter: backdropFilters.panel,
    border: `1px solid ${vars.glass.stroke}`,
    transition: themeTransition,
  },
  variants: {
    size: {
      sm: { borderRadius: radii["sm+2"] },
      md: { borderRadius: radii["md+2"] },
      lg: { borderRadius: radii["lg+2"] },
      xl: { borderRadius: radii["xl+2"] },
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export type PopoverVariants = NonNullable<Parameters<typeof popover>[0]>;

export const pillBtn = recipe({
  base: {
    fontFamily: vars.font.ui,
    fontWeight: 600,
    borderRadius: radii.pill,
    cursor: "pointer",
    border: "1px solid transparent",
    display: "inline-flex",
    alignItems: "center",
    gap: space["2"],
    transition: buttonTransition,
    selectors: {
      "&:active": { transform: "scale(0.98)" },
      "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
    },
  },
  variants: {
    variant: {
      // True transparent glass — bg and border tint with currentColor so the
      // button adapts to light/dark without explicit branches. Used as the
      // "secondary" action on glass dialogs. Hover overlays a fixed-white wash
      // (via inset box-shadow) so the brighten direction is theme-neutral —
      // mixing currentColor further would darken in light mode.
      glass: {
        background: "color-mix(in srgb, currentColor 8%, transparent)",
        backdropFilter: backdropFilters.button,
        WebkitBackdropFilter: backdropFilters.button,
        border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
        color: vars.ink,
        selectors: {
          "&:hover:not(:disabled)": {
            boxShadow: "inset 0 0 0 999px rgba(255, 255, 255, 0.10)",
          },
        },
      },
      // Primary glass — same transparent treatment as `glass` but with more
      // tint weight in bg + border + font, so it reads as the action without
      // becoming opaque. Theme-adaptive via currentColor.
      glassInk: {
        background: "color-mix(in srgb, currentColor 16%, transparent)",
        backdropFilter: backdropFilters.button,
        WebkitBackdropFilter: backdropFilters.button,
        border: "1px solid color-mix(in srgb, currentColor 32%, transparent)",
        color: vars.ink,
        fontWeight: 700,
        selectors: {
          "&:hover:not(:disabled)": {
            boxShadow: "inset 0 0 0 999px rgba(255, 255, 255, 0.12)",
          },
        },
      },
      // Opaque dark — pure ink bg. Use when full punch is needed.
      solid: {
        background: vars.ink,
        color: vars.paper,
      },
      // Opaque light — pure paper bg, ink text. For use on dark surfaces
      // like the WeekStructureModal banner where solid would blend in.
      solidLight: {
        background: vars.paper,
        color: vars.ink,
      },
      ghost: {
        background: "transparent",
        color: vars.inkSoft,
        selectors: {
          "&:hover": { color: vars.ink },
        },
      },
      // Outlined — transparent fill with an ink-colored border. Pairs with
      // `solid` as a secondary CTA on light surfaces.
      outlined: {
        background: "transparent",
        color: vars.ink,
        border: `1px solid ${vars.ink}`,
        selectors: {
          "&:hover:not(:disabled)": {
            background: vars.interactive.hoverFill,
          },
        },
      },
      danger: {
        background: vars.status.error,
        color: vars.textOnAccent,
      },
    },
    size: {
      sm: { padding: "5px 12px", fontSize: 12 },
      md: { padding: "6px 14px", fontSize: 12.5 },
      lg: { padding: "8px 18px", fontSize: 14 },
    },
  },
  defaultVariants: {
    variant: "solid",
    size: "md",
  },
});

export type PillBtnVariants = NonNullable<Parameters<typeof pillBtn>[0]>;

// Canonical square icon button: chevrons, pencils, close X's, row menus.
// One footprint per size so sibling icon buttons line up across surfaces.
export const iconBtn = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    border: "none",
    background: "transparent",
    color: vars.inkSoft,
    borderRadius: radii.xs,
    cursor: "pointer",
    padding: 0,
    transition: buttonTransition,
    selectors: {
      "&:hover:not(:disabled)": {
        background: vars.interactive.hoverFill,
        color: vars.ink,
      },
      "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
    },
  },
  variants: {
    size: {
      sm: { width: 22, height: 22 },
      md: { width: 26, height: 26 },
    },
  },
  defaultVariants: { size: "md" },
});

export type IconBtnVariants = NonNullable<Parameters<typeof iconBtn>[0]>;

// Canonical interactive list row: transparent at rest, hoverFill on hover,
// selectedFill when selected. Compose with text.row for the row typeface.
export const listRow = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    borderRadius: radii.sm,
    padding: `${space["1"]}px ${space["2"]}px`,
    cursor: "pointer",
    transition: themeTransition,
    selectors: {
      "&:hover": { background: vars.interactive.hoverFill },
    },
  },
  variants: {
    selected: {
      true: {
        background: vars.interactive.selectedFill,
        selectors: {
          "&:hover": { background: vars.interactive.selectedFill },
        },
      },
    },
  },
});

export type ListRowVariants = NonNullable<Parameters<typeof listRow>[0]>;

export const badge = recipe({
  base: {
    fontFamily: vars.font.ui,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    borderRadius: radii.pill,
    border: "1px solid transparent",
    display: "inline-flex",
    alignItems: "center",
    gap: space["1.5"],
    whiteSpace: "nowrap",
    lineHeight: 1,
    transition: themeTransition,
  },
  variants: {
    tone: {
      type: { background: vars.ink, color: vars.paper },
      now: { background: vars.accent.now, color: vars.textOnAccent },
      done: { background: vars.accent.done, color: vars.textOnAccent },
      success: { background: vars.status.success, color: vars.textOnAccent },
      warning: { background: vars.status.warning, color: vars.ink },
      error: { background: vars.status.error, color: vars.textOnAccent },
      info: { background: vars.status.info, color: vars.textOnAccent },
      neutral: {
        background: vars.glass.bgSoft,
        border: `1px solid ${vars.rule}`,
        color: vars.inkSoft,
      },
    },
    size: {
      sm: { fontSize: 9, padding: "1.5px 7px", letterSpacing: "0.08em" },
      md: { fontSize: 10.5, padding: "3px 10px" },
    },
  },
  defaultVariants: {
    tone: "neutral",
    size: "md",
  },
});

export type BadgeVariants = NonNullable<Parameters<typeof badge>[0]>;

// The single source of truth for every text input in the app, consumed
// through the <Input> primitive. Four intentional shapes:
//   boxed — labeled form fields (settings, locations, item detail). A clear
//     container anchor per field. The default.
//   underline — single-input "command bar" modals (Capture, NewPlanModal).
//     The input IS the modal; large font, no box, just a focus underline.
//   bare — an input embedded in an already-styled wrapper (search pills). No
//     box of its own; inherits the wrapper's surface.
//   titleInline — inline rename editors that replace a static display title.
//     Carries only the accent-underline treatment; the caller composes the
//     display typography so a page title and a popover title keep their scale.
// The base owns the theme-invariant behavior (focus reset, placeholder,
// disabled, number-spinner removal); each variant sets font + shape so the
// typography-agnostic titleInline can borrow the caller's display preset
// without a font-family collision.
export const formInput = recipe({
  base: {
    color: vars.ink,
    outline: "none",
    width: "100%",
    transition: themeTransition,
    selectors: {
      "&::placeholder": { color: vars.muted },
      "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
      "&::-webkit-inner-spin-button": { appearance: "none", margin: 0 },
      "&::-webkit-outer-spin-button": { appearance: "none", margin: 0 },
    },
  },
  variants: {
    variant: {
      boxed: {
        fontFamily: vars.font.ui,
        fontSize: 13,
        fontWeight: 500,
        padding: `${space["1"]}px ${space["4"]}px`,
        background: "transparent",
        border: `1px solid ${vars.glass.stroke}`,
        borderRadius: radii.sm,
        selectors: {
          "&:focus": { borderColor: vars.accent.primary },
        },
      },
      underline: {
        fontFamily: vars.font.ui,
        fontSize: 16,
        fontWeight: 500,
        padding: "8px 0",
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${vars.rule}`,
        selectors: {
          "&:focus": { borderBottomColor: vars.accent.primary },
        },
      },
      bare: {
        fontFamily: vars.font.ui,
        fontSize: 13,
        fontWeight: 500,
        padding: 0,
        background: "transparent",
        border: "none",
      },
      titleInline: {
        padding: 0,
        margin: 0,
        background: "transparent",
        border: "none",
        borderBottom: `${borderWidth.medium}px solid ${vars.accent.primary}`,
        boxSizing: "content-box",
      },
    },
    scale: {
      md: {},
      lg: {
        // `&&` beats boxed's padding by specificity; block axis only so per-field horizontal overrides keep control.
        // eslint-disable-next-line theme/no-raw-scale-values
        selectors: { "&&": { paddingBlock: 9 } },
      },
    },
  },
  defaultVariants: { variant: "boxed", scale: "md" },
});

export type FormInputVariants = NonNullable<Parameters<typeof formInput>[0]>;

export const progressTrack = recipe({
  base: {
    width: "100%",
    height: 6,
    background: vars.rule,
    borderRadius: radii.pill,
    overflow: "hidden",
    position: "relative",
  },
  variants: {
    size: {
      sm: { height: 4 },
      md: { height: 6 },
      lg: { height: 8 },
    },
  },
  defaultVariants: { size: "md" },
});
