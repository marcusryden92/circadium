import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space, media } from "@/lib/theme/scales";
import { display, text } from "@/lib/theme/typography.css";
import { themeTransition } from "@/lib/theme/transitions";
import { desktopGuard } from "@/lib/theme";

export const headerRow = style({
  padding: "30px 32px 22px",
  flexShrink: 0,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: space["6"],
  "@media": {
    [media.mobile]: {
      padding: space["4"],
      flexDirection: "column",
      alignItems: "center",
      gap: space["3.5"],
      textAlign: "center",
    },
  },
});

export const routeName = style([
  desktopGuard,
  {
    marginTop: space["2"],
    marginBottom: space["6"],
    borderBottom: "1px solid " + vars.rule,
    fontSize: space["4.5"],
  },
]);

export const titleContainer = style({
  "@media": {
    [media.mobile]: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    },
  },
});

export const greeting = style([
  display.hero,
  {
    lineHeight: 0.98,
    fontWeight: 300,
    color: vars.ink,
    margin: 0,
    transition: themeTransition,
    "@media": {
      [media.mobile]: { fontSize: 38, lineHeight: 1.2 },
    },
  },
]);

export const summaryLine = style([
  text.bodyLg,
  {
    marginTop: space["2.5"],
    marginLeft: space["2"],
    color: vars.inkSoft,
    transition: themeTransition,
    "@media": {
      [media.mobile]: { marginLeft: 0 },
    },
  },
]);

export const summaryStrong = style({
  fontVariantNumeric: "tabular-nums",
  fontWeight: 600,
  color: vars.ink,
  transition: themeTransition,
});

export const summaryError = style({
  color: vars.status.error,
  fontWeight: 600,
  transition: themeTransition,
});

export const headerActions = style({
  display: "flex",
  gap: space["2"],
  flexShrink: 0,
  "@media": {
    [media.mobile]: { width: "100%" },
  },
});

// The page-header "Open calendar" moves into the Agenda card header on mobile.
export const openCalendarLink = style({
  "@media": {
    [media.mobile]: { display: "none" },
  },
});
