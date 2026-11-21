import { style } from "@vanilla-extract/css";
import { media } from "./scales";

// Compose onto any element to drop it out of the layout on the opposite side
// of the mobile/desktop split. `media.mobile` and `media.tabletUp` are exact
// complements (tabletUp starts one pixel past the mobile ceiling and excludes
// the landscape phone), so the two guards never overlap or leave a gap.

export const mobileGuard = style({
  "@media": {
    [media.mobile]: { display: "none" },
  },
});

export const mobileLandscapeGuard = style({
  "@media": {
    [media.landscapePhone]: { display: "none" },
  },
});

export const desktopGuard = style({
  "@media": {
    [media.tabletUp]: { display: "none" },
  },
});
