import { style, keyframes, globalStyle } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, radii } from "@/lib/theme/scales";
import { text, fieldLabel } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";

export const wrap = style({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
});

// Message list has no background of its own — it sits directly on the darker
// chat pane bg. Padding gives the messages room to breathe from the pane
// edges.
export const messageList = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  gap: space["3"],
  padding: "6px 6px",
  transition: themeTransition,
  // Opt back in from the global user-select: none — chat text is copyable.
  userSelect: "text",
});

export const empty = style([
  text.bodySm,
  {
    flex: 1,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: space["6"],
    color: vars.muted,
    textAlign: "center",
    lineHeight: 1.55,
  },
]);

// No explicit fontFamily: message text reads in the app's regular body font
// (inherited from <body>) rather than the UI font.
const messageBase = style({
  display: "flex",
  flexDirection: "column",
  gap: space["1"],
  fontSize: 13,
  lineHeight: 1.6,
  color: vars.ink,
  transition: themeTransition,
});

// User: subtle accent-tinted bubble on the right. Feels like a Circadium
// message rather than a generic chat balloon by borrowing the accent hue.
export const messageUser = style([
  messageBase,
  {
    alignSelf: "flex-end",
    maxWidth: "82%",
    padding: "8px 14px",
    borderRadius: radii["lg+2"],
    background: `color-mix(in srgb, ${vars.accent.primary} 14%, ${vars.paper})`,
    border: `1px solid color-mix(in srgb, ${vars.accent.primary} 22%, transparent)`,
  },
]);

// Assistant: no bubble. Plain text on the darker chat surface — modern chat
// UX and stays out of the way of longer reasoning responses.
export const messageAssistant = style([
  messageBase,
  {
    alignSelf: "stretch",
    maxWidth: "100%",
    padding: "2px 6px",
  },
]);

export const messageRole = style([
  fieldLabel,
  {
    fontWeight: 700,
  },
]);

export const messageContent = style({
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

// Assistant replies render as markdown. The wrapper resets pre-wrap (markdown
// manages its own whitespace) and the globalStyle rules below theme the
// generated elements — scoped to this class so nothing leaks.
export const markdownBody = style({
  display: "block",
  whiteSpace: "normal",
  minWidth: 0,
});

globalStyle(`${markdownBody} p`, {
  margin: "0 0 8px",
});
globalStyle(`${markdownBody} > :last-child, ${markdownBody} li > :last-child`, {
  marginBottom: 0,
});
globalStyle(`${markdownBody} ul, ${markdownBody} ol`, {
  margin: "4px 0 8px",
  paddingLeft: space["5"],
});
globalStyle(`${markdownBody} li`, {
  margin: "2px 0",
});
globalStyle(`${markdownBody} strong`, {
  fontWeight: 650,
});
globalStyle(
  `${markdownBody} h1, ${markdownBody} h2, ${markdownBody} h3, ${markdownBody} h4`,
  {
    fontSize: 13,
    fontWeight: 700,
    margin: "10px 0 4px",
    lineHeight: 1.4,
  },
);
globalStyle(`${markdownBody} code`, {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: 12,
  padding: "1px 5px",
  borderRadius: 4,
  background: `color-mix(in srgb, ${vars.ink} 8%, transparent)`,
});
globalStyle(`${markdownBody} pre`, {
  margin: "4px 0 8px",
  padding: "8px 10px",
  borderRadius: radii.sm,
  border: `1px solid ${vars.rule}`,
  background: `color-mix(in srgb, ${vars.ink} 5%, transparent)`,
  overflowX: "auto",
});
globalStyle(`${markdownBody} pre code`, {
  padding: 0,
  background: "transparent",
});
globalStyle(`${markdownBody} a`, {
  color: vars.accent.primary,
  textDecoration: "underline",
  textUnderlineOffset: 2,
});
globalStyle(`${markdownBody} blockquote`, {
  margin: "4px 0 8px",
  paddingLeft: space["2.5"],
  borderLeft: `2px solid ${vars.rule}`,
  color: vars.inkSoft,
});
globalStyle(`${markdownBody} hr`, {
  border: "none",
  borderTop: `1px solid ${vars.rule}`,
  margin: "10px 0",
});
globalStyle(`${markdownBody} table`, {
  borderCollapse: "collapse",
  margin: "4px 0 8px",
  fontSize: 12,
});
globalStyle(`${markdownBody} th, ${markdownBody} td`, {
  border: `1px solid ${vars.rule}`,
  padding: "3px 8px",
  textAlign: "left",
});

const dotPulse = keyframes({
  "0%, 80%, 100%": { opacity: 0.25 },
  "40%": { opacity: 1 },
});

export const streamingDots = style({
  display: "inline-flex",
  alignItems: "center",
  gap: space["1"],
  marginLeft: space["1.5"],
  verticalAlign: "middle",
});

export const streamingDot = style({
  width: 4,
  height: 4,
  borderRadius: radii.pill,
  background: vars.muted,
  animation: `${dotPulse} 1.4s ease-in-out infinite`,
  selectors: {
    "&:nth-child(2)": { animationDelay: "0.15s" },
    "&:nth-child(3)": { animationDelay: "0.3s" },
  },
});

// Composer sits on paper — a light card at the bottom of the darker chat
// pane. Focus ring uses accent to match the user bubble tint.
export const composer = style({
  flexShrink: 0,
  display: "flex",
  alignItems: "flex-end",
  gap: space["2"],
  padding: space["2"],
  borderRadius: radii["md+2"],
  border: `1px solid ${vars.rule}`,
  background: vars.paper,
  transition: themeTransition,
  selectors: {
    "&:focus-within": {
      borderColor: vars.accent.primary,
    },
  },
});

export const textarea = style({
  flex: 1,
  minHeight: 22,
  maxHeight: 160,
  resize: "none",
  border: "none",
  outline: "none",
  background: "transparent",
  padding: "4px 6px",
  fontFamily: "inherit",
  fontSize: 13,
  lineHeight: 1.5,
  color: vars.ink,
  transition: themeTransition,
  selectors: {
    "&::placeholder": { color: vars.muted },
  },
});
