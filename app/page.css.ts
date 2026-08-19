import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, contentWidth, media, radii, zIndex } from "@/lib/theme/scales";

// ---------- page chrome ----------
// No horizontal padding — sections handle their own. This lets full-bleed
// sections (e.g. the dark prose section) reach the viewport edge cleanly
// while bezeled elements (hero, close card) supply their own 12px inset.
// `main` itself is the scroll container so the `.custom-scrollbar` rules
// from globals.css apply (instead of the browser's default page scrollbar).
export const page = style({
  height: "100vh",
  width: "100%",
  boxSizing: "border-box",
  background: vars.paper,
  padding: 0,
  color: vars.ink,
  overflowY: "auto",
  overflowX: "hidden",
});

// ---------- hero ----------
// Full-viewport bezeled card: the vector field carries the nav and the
// headline as overlays. Overlay wrappers are pointer-transparent so the
// canvas keeps its mouse interactivity; only the actual controls re-enable
// pointer events.
export const hero = style({
  position: "relative",
  borderRadius: radii["3xl"],
  overflow: "hidden",
  isolation: "isolate",
  background: vars.ink,
  height: ["calc(100vh - 24px)", "calc(100svh - 24px)"],
  marginInline: space["3"],
  marginTop: space["3"],
  "@media": {
    [media.mobile]: {
      borderRadius: radii.none,
      height: ["100vh", "100svh"],
      marginInline: 0,
      marginTop: 0,
    },
  },
});

export const heroScrim = style({
  position: "absolute",
  inset: 0,
  zIndex: 1,
  pointerEvents: "none",
  background:
    "linear-gradient(to top, rgba(11,9,26,0.68) 0%, rgba(11,9,26,0.28) 36%, transparent 62%)",
});

export const heroNav = style({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["4"],
  padding: "18px clamp(16px, 2.4vw, 32px)",
  pointerEvents: "none",
});

export const heroWordmark = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["2.5"],
  fontFamily: vars.font.display,
  fontSize: 24,
  fontWeight: 500,
  letterSpacing: "-0.02em",
  color: "#f2efea",
  textDecoration: "none",
  lineHeight: 1,
  pointerEvents: "auto",
});

export const navActions = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  pointerEvents: "auto",
});

// Landing-specific light ghost button — the pillBtn ghost variant reads
// ink-on-paper and would vanish on the dark field.
export const heroSignIn = style({
  fontFamily: vars.font.ui,
  fontSize: 12.5,
  fontWeight: 600,
  padding: "6px 14px",
  borderRadius: radii.pill,
  border: "1px solid rgba(242,239,234,0.35)",
  background: "transparent",
  color: "rgba(242,239,234,0.85)",
  cursor: "pointer",
  transition:
    "background 160ms ease, color 160ms ease, border-color 160ms ease",
  selectors: {
    "&:hover": {
      background: "rgba(242,239,234,0.12)",
      color: "#f2efea",
    },
  },
});

export const heroContent = style({
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  gap: space["4"],
  padding: "0 clamp(24px, 4vw, 72px) clamp(40px, 5vw, 72px)",
  pointerEvents: "none",
  "@media": {
    [media.mobile]: { padding: "0 22px 48px", gap: space["3.5"] },
  },
});

export const heroHeadline = style({
  fontFamily: vars.font.display,
  fontSize: "clamp(40px, 5.6vw, 86px)",
  fontWeight: 400,
  letterSpacing: "-0.025em",
  lineHeight: 1.03,
  color: "#f2efea",
  margin: 0,
  maxWidth: 920,
});

globalStyle(`${heroHeadline} em`, {
  fontStyle: "italic",
  fontWeight: 400,
  color: "#60a5fa",
});

export const heroSubhead = style({
  fontFamily: vars.font.display,
  fontSize: "clamp(20px, 2.2vw, 30px)",
  fontWeight: 400,
  letterSpacing: "-0.015em",
  lineHeight: 1.25,
  color: "rgba(242,239,234,0.72)",
  margin: 0,
});

globalStyle(`${heroSubhead} em`, {
  fontStyle: "italic",
  fontWeight: 400,
  color: "#60a5fa",
});

export const heroCta = style({
  display: "flex",
  alignItems: "center",
  gap: space["3.5"],
  marginTop: space["2"],
  flexWrap: "wrap",
  pointerEvents: "auto",
});

export const heroCtaNote = style({
  fontFamily: vars.font.ui,
  fontSize: 12.5,
  color: "rgba(242,239,234,0.55)",
  letterSpacing: "0.01em",
});

// ---------- floating pill nav (appears once the hero scrolls away) ----------
export const pillNav = style({
  position: "fixed",
  top: 14,
  left: "50%",
  zIndex: zIndex.floating,
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: "7px 8px 7px 16px",
  borderRadius: radii.pill,
  background: vars.glass.bgDeep,
  border: `1px solid ${vars.glass.stroke}`,
  boxShadow: vars.shadow.panelSm,
  backdropFilter: "blur(16px) saturate(140%)",
  WebkitBackdropFilter: "blur(16px) saturate(140%)",
  opacity: 0,
  transform: "translate(-50%, -16px)",
  pointerEvents: "none",
  transition:
    "opacity 260ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
});

export const pillNavVisible = style({
  opacity: 1,
  transform: "translate(-50%, 0)",
  pointerEvents: "auto",
});

globalStyle(`${pillNav} button`, {
  whiteSpace: "nowrap",
});

export const pillNavSecondary = style({
  "@media": {
    [media.mobile]: { display: "none" },
  },
});

export const pillNavWordmark = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["2"],
  fontFamily: vars.font.display,
  fontSize: 16,
  fontWeight: 500,
  letterSpacing: "-0.02em",
  color: vars.ink,
  textDecoration: "none",
  lineHeight: 1,
  marginRight: space["2"],
});

// ---------- lead (sits directly beneath the hero) ----------
export const leadSection = style({
  padding:
    "clamp(64px, 8vw, 110px) clamp(24px, 4vw, 80px) clamp(72px, 9vw, 120px) clamp(28px, 4vw, 80px)",
  display: "flex",
  flexDirection: "column",
  "@media": {
    [media.mobile]: { padding: "56px 24px 64px" },
  },
});

export const leadInner = style({
  display: "flex",
  flexDirection: "column",
  gap: space["4"],
});

export const leadText = style({
  fontFamily: vars.font.ui,
  fontSize: "clamp(17px, 1.5vw, 21px)",
  lineHeight: 1.6,
  color: vars.inkSoft,
  margin: 0,
  maxWidth: contentWidth.sm,
});

export const leadEmphasis = style({
  fontFamily: vars.font.display,
  fontSize: "clamp(24px, 2.8vw, 42px)",
  fontWeight: 400,
  letterSpacing: "-0.02em",
  lineHeight: 1.15,
  color: vars.ink,
  margin: 0,
  marginTop: space["3"],
  maxWidth: contentWidth.md,
});

// ---------- editorial sections ----------
export const prose = style({
  display: "flex",
  flexDirection: "column",
});

const proseSectionBase = style({
  padding: "clamp(96px, 10vw, 160px) clamp(12px, 1.6vw, 28px)",
  position: "relative",
  "@media": {
    [media.mobile]: { padding: "72px 24px" },
  },
});

// Light prose section. Sections 1 and 3 (within the prose container) pick
// up a soft tint via :nth-child so adjacent light sections don't blur into
// each other. The dark section at position 2 uses a different class and
// is unaffected by these selectors.
export const proseSection = style([
  proseSectionBase,
  {
    background: vars.paper,
    color: vars.ink,
    borderTop: `1px solid ${vars.rule}`,
    selectors: {
      "&:nth-child(1), &:nth-child(3)": {
        background: `color-mix(in srgb, ${vars.ink} 5%, ${vars.paper})`,
      },
    },
  },
]);

// Dark inverse — used for one mid-page section to break the rhythm.
export const proseSectionDark = style([
  proseSectionBase,
  {
    background: vars.ink,
    color: vars.paper,
    overflow: "hidden",
  },
]);

// Asymmetric two-column: marker on the left, content on the right.
// Left column is fixed-ish; right column flows to a comfortable measure.
export const proseGrid = style({
  display: "grid",
  gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr)",
  gap: "clamp(32px, 6vw, 96px)",
  maxWidth: contentWidth["2xl"],
  margin: "0 auto",
  alignItems: "start",
  "@media": {
    [media.mobile]: {
      gridTemplateColumns: "1fr",
      gap: space["7"],
    },
  },
});

export const proseAside = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3.5"],
  fontFamily: vars.font.ui,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: vars.muted,
  position: "sticky",
  top: 24,
  "@media": {
    [media.mobile]: {
      position: "static",
      flexDirection: "row",
      alignItems: "center",
      gap: space["3"],
    },
  },
});

export const proseNumber = style({
  fontFamily: vars.font.display,
  fontSize: 22,
  fontWeight: 400,
  letterSpacing: "-0.01em",
  color: "currentColor",
  textTransform: "none",
});

globalStyle(`${proseNumber} span`, {
  fontFamily: vars.font.ui,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.14em",
  color: vars.muted,
  marginLeft: space["2"],
});

// Short horizontal hairline that ties the aside marker to the page rhythm.
export const proseRule = style({
  display: "block",
  width: 48,
  height: 1,
  background: "currentColor",
  opacity: 0.35,
  "@media": {
    [media.mobile]: { display: "none" },
  },
});

export const proseHeading = style({
  fontFamily: vars.font.display,
  fontSize: "clamp(32px, 4.2vw, 60px)",
  fontWeight: 400,
  letterSpacing: "-0.025em",
  lineHeight: 1.05,
  color: "currentColor",
  margin: 0,
  marginBottom: "clamp(32px, 3.5vw, 48px)",
  maxWidth: contentWidth.md,
});

export const proseBody = style({
  display: "flex",
  flexDirection: "column",
  gap: space["5"],
  fontFamily: vars.font.ui,
  maxWidth: 680,
});

export const proseLine = style({
  fontSize: "clamp(16px, 1.15vw, 18px)",
  lineHeight: 1.6,
  color: "currentColor",
  opacity: 0.78,
  margin: 0,
});

// Pull-quote: emphasized line breaks out of the body flow with a hanging
// accent rule on the left and a larger display setting.
export const proseEmphasis = style({
  fontFamily: vars.font.display,
  fontSize: "clamp(22px, 2vw, 30px)",
  lineHeight: 1.25,
  fontWeight: 400,
  letterSpacing: "-0.015em",
  color: "currentColor",
  margin: 0,
  marginTop: space["2"],
  marginBottom: space["2"],
  paddingLeft: space["5"],
  borderLeft: `2px solid ${vars.accent.primary}`,
});

// ---------- product screenshots — framed figures attached to their claims ----------
export const shotFigure = style({
  margin: 0,
  marginTop: "clamp(36px, 4.5vw, 56px)",
  maxWidth: 1040,
});

export const shotFrame = style({
  borderRadius: radii["xl+2"],
  border: `1px solid ${vars.rule}`,
  overflow: "hidden",
  boxShadow: vars.shadow.panel,
  background: vars.paper,
});

export const shotImg = style({
  display: "block",
  width: "100%",
  height: "auto",
});

export const shotCaption = style({
  marginTop: space["3"],
  fontFamily: vars.font.ui,
  fontSize: 12.5,
  lineHeight: 1.5,
  color: vars.muted,
});

// ---------- features — concrete capability vignettes ----------
export const featuresSection = style({
  padding: "clamp(96px, 10vw, 160px) clamp(12px, 1.6vw, 28px)",
  borderTop: `1px solid ${vars.rule}`,
  "@media": {
    [media.mobile]: { padding: "72px 24px" },
  },
});

export const featuresHeader = style({
  maxWidth: contentWidth["2xl"],
  margin: "0 auto",
  marginBottom: "clamp(40px, 5vw, 64px)",
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
});

export const featuresKicker = style({
  fontFamily: vars.font.ui,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: vars.muted,
  margin: 0,
});

export const featuresHeading = style({
  fontFamily: vars.font.display,
  fontSize: "clamp(32px, 4.2vw, 60px)",
  fontWeight: 400,
  letterSpacing: "-0.025em",
  lineHeight: 1.05,
  color: vars.ink,
  margin: 0,
});

export const featuresList = style({
  maxWidth: contentWidth["2xl"],
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: "clamp(72px, 9vw, 128px)",
});

// Two-column subsection — vignette side + content side. Ordering is done in
// JSX so vanilla-extract doesn't need descendant selectors; the reverse
// variant is here as a stable hook in case we want to style asymmetries
// per-side later.
export const featureRow = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "clamp(32px, 6vw, 96px)",
  alignItems: "center",
  "@media": {
    [media.mobile]: {
      gridTemplateColumns: "1fr",
      gap: space["6"],
    },
  },
});

export const featureRowReverse = style([featureRow, {}]);

export const featureVisual = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 200,
  "@media": {
    [media.mobile]: { minHeight: 0, justifyContent: "flex-start" },
  },
});

export const featureContent = style({
  display: "flex",
  flexDirection: "column",
  gap: space["3.5"],
  maxWidth: contentWidth.xs,
});

export const featureIndex = style({
  fontFamily: vars.font.ui,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: vars.muted,
});

export const featureName = style({
  fontFamily: vars.font.display,
  fontSize: "clamp(26px, 2.8vw, 38px)",
  fontWeight: 400,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
  color: vars.ink,
  margin: 0,
});

export const featureBody = style({
  fontFamily: vars.font.ui,
  fontSize: "clamp(15px, 1.1vw, 17px)",
  lineHeight: 1.6,
  color: vars.inkSoft,
  margin: 0,
});

// ---------- capabilities index — quiet manifest under the feature rows ----------
export const alsoSection = style({
  padding: "clamp(64px, 7vw, 104px) clamp(12px, 1.6vw, 28px)",
  borderTop: `1px solid ${vars.rule}`,
  "@media": {
    [media.mobile]: { padding: "56px 24px" },
  },
});

export const alsoInner = style({
  maxWidth: contentWidth["2xl"],
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: "clamp(28px, 3vw, 40px)",
});

export const alsoGrid = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "clamp(20px, 2.5vw, 32px) clamp(32px, 5vw, 72px)",
  "@media": {
    [media.mobile]: {
      gridTemplateColumns: "1fr",
      gap: space["5"],
    },
  },
});

export const alsoItem = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1.5"],
  maxWidth: contentWidth.xs,
});

export const alsoName = style({
  fontFamily: vars.font.ui,
  fontSize: 14.5,
  fontWeight: 600,
  letterSpacing: "-0.005em",
  color: vars.ink,
});

export const alsoDesc = style({
  fontFamily: vars.font.ui,
  fontSize: 13.5,
  lineHeight: 1.55,
  color: vars.muted,
  margin: 0,
});

// ---------- close — vector-field reprise ----------
// Card width matches the hero: it fills the page bezel (12px inline margin),
// so the section adds only vertical padding. The card hosts a calmer second
// VectorField instance behind the content, bookending the page.
export const closeSection = style({
  padding: "clamp(72px, 8vw, 120px) 0",
  "@media": {
    [media.mobile]: { padding: "72px 0" },
  },
});

export const closeCard = style({
  position: "relative",
  isolation: "isolate",
  overflow: "hidden",
  borderRadius: radii["3xl"],
  background: vars.ink,
  color: vars.paper,
  padding: "clamp(72px, 9vw, 120px) clamp(32px, 6vw, 96px)",
  marginInline: space["3"],
  "@media": {
    [media.mobile]: {
      padding: "64px 28px",
      borderRadius: radii.none,
      marginInline: 0,
    },
  },
});

export const closeScrim = style({
  position: "absolute",
  inset: 0,
  background: "rgba(11,9,26,0.38)",
  pointerEvents: "none",
});

export const closeInner = style({
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: space["3.5"],
  pointerEvents: "none",
});

export const closeHeading = style({
  fontFamily: vars.font.display,
  fontSize: "clamp(34px, 5vw, 60px)",
  fontWeight: 400,
  letterSpacing: "-0.025em",
  lineHeight: 1.05,
  margin: 0,
  maxWidth: contentWidth.sm,
});

export const closeBody = style({
  fontFamily: vars.font.ui,
  fontSize: "clamp(15px, 1.15vw, 17px)",
  lineHeight: 1.5,
  color: "rgba(242,239,234,0.78)",
  margin: 0,
  maxWidth: contentWidth.xs,
});

export const closeActions = style({
  display: "flex",
  gap: space["2.5"],
  marginTop: space["5"],
  flexWrap: "wrap",
  justifyContent: "center",
  pointerEvents: "auto",
});

export const closeNote = style({
  fontFamily: vars.font.ui,
  fontSize: 12.5,
  color: "rgba(242,239,234,0.55)",
  margin: 0,
  marginTop: space["2"],
  letterSpacing: "0.01em",
});

// ---------- footer ----------
export const footer = style({
  padding: "32px clamp(24px, 6vw, 96px) 40px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space["4"],
  borderTop: `1px solid ${vars.rule}`,
  color: vars.muted,
  fontSize: 12,
  fontFamily: vars.font.ui,
  "@media": {
    [media.mobile]: {
      flexDirection: "column",
      alignItems: "flex-start",
      padding: "24px 24px 32px",
    },
  },
});

export const footerLinks = style({
  display: "flex",
  gap: space["5"],
});

export const footerLink = style({
  color: vars.muted,
  textDecoration: "none",
  selectors: {
    "&:hover": { color: vars.ink },
  },
});
