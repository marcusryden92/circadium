import { style, createVar } from "@vanilla-extract/css";
import { collapseTransition } from "@/lib/theme/transitions";


// Set inline per instance; the mark and text read them so one logo-height
// input drives the whole lockup.
export const logoHeightVar = createVar();
export const fontSizeVar = createVar();
export const gapVar = createVar();
export const toneVar = createVar();
export const weightVar = createVar();

const maskCommon = {
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
} as const;

export const root = style({
  display: "inline-flex",
  alignItems: "center",
  gap: gapVar,
  lineHeight: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
});

export const mark = style({
  width: logoHeightVar,
  height: logoHeightVar,
  flexShrink: 0,
  backgroundColor: toneVar,
  WebkitMaskImage: "url(/logo.svg)",
  maskImage: "url(/logo.svg)",
  ...maskCommon,
});

export const text = style({
  fontFamily: "var(--app-font-logo), system-ui, sans-serif",
  fontSize: fontSizeVar,
  fontWeight: weightVar,
  letterSpacing: "-0.02em",
  color: toneVar,
  margin: 0,
  minWidth: 0,
  // Concrete value (not `none`) so the collapse can interpolate max-width -> 0.
  maxWidth: "6em",
  overflow: "hidden",
  transition: collapseTransition,
});

// Drives the Sidebar collapse: the mark stays, the wordmark folds away.
export const textCollapsed = style({
  maxWidth: 0,
  opacity: 0,
  transition: collapseTransition,
});
