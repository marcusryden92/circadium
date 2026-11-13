import { space } from "@/lib/theme/scales";

// One source of truth for the top-corner action pills' footprint, shared with
// PageHeader so the pill size and the header's reserved gutter can't drift.
export const CORNER_ACTION_SIZE = 44;
export const CORNER_ACTION_INSET = space["3"];

// Horizontal room a pill occupies from the viewport edge — a portrait-mobile
// page header reserves this as padding so its centered content clears the pill.
export const CORNER_ACTION_GUTTER = CORNER_ACTION_SIZE + CORNER_ACTION_INSET;
