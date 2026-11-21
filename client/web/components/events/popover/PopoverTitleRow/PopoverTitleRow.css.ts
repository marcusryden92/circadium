import { style } from "@vanilla-extract/css";
import { vars } from "@/lib/theme/tokens.css";
import { space } from "@/lib/theme/scales";
import { iconBtn } from "@/lib/theme/recipes.css";
import { display } from "@/lib/theme/typography.css";

const TITLE_LINE_HEIGHT = 26;
const TITLE_BORDER = 2;

export const titleRow = style({
  display: "flex",
  alignItems: "center",
  gap: space["2"],
  padding: "12px 14px 0",
});

// Display-font title, fixed height, transparent border reserving the same
// vertical space the editing input's accent underline occupies so swapping
// in/out doesn't pop the layout.
const titleBase = style([
  display.modalTitle,
  {
    lineHeight: `${TITLE_LINE_HEIGHT}px`,
    color: vars.ink,
    margin: 0,
    padding: 0,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    height: TITLE_LINE_HEIGHT,
    boxSizing: "content-box",
    borderBottom: `${TITLE_BORDER}px solid transparent`,
  },
]);

export const titleEditable = style([titleBase, { cursor: "text" }]);

export const titleReadonly = style([titleBase, { cursor: "default" }]);

// Route-heading variant (Travel's "From → To" with a leading icon).
export const routeHeading = style([
  titleBase,
  {
    cursor: "default",
    display: "inline-flex",
    alignItems: "center",
    gap: space["2"],
  },
]);

export const leadingIcon = style({
  color: vars.muted,
  flexShrink: 0,
});

// The <Input variant="titleInline"> supplies the accent underline + box reset;
// this layers the modal-title typography and the height matched to the static
// title so toggling rename in/out doesn't shift layout.
export const titleInput = style([
  display.modalTitle,
  {
    lineHeight: `${TITLE_LINE_HEIGHT}px`,
    flex: 1,
    display: "block",
    height: TITLE_LINE_HEIGHT,
  },
]);

export const renamePencil = iconBtn({ size: "sm" });
