import { vars } from "@/lib/theme";
import type { AgendaItem } from "./_data/types";

// Distinct color per agenda kind for the group-header dot and any other
// type-coded affordance. Categories carry their own color elsewhere; this
// is the dashboard's own type palette so the divider conveys "what type"
// even when an item has no category.
export const TYPE_COLOR: Record<AgendaItem["kind"], string> = {
  goal: vars.accent.done,
  plan: vars.status.info,
  task: vars.swatches.blue,
  template: vars.swatches.violet,
  travel: vars.muted,
};
