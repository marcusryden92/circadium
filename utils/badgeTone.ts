export type PlannerTypeTone = "type" | "info" | "done" | "neutral";

// Map a PlannerType (or dashboard-only kinds like "travel"/"template") to a
// badge tone. Used by the library list, the item detail header, the dashboard
// agenda, and any other surface that wants a consistent type-coded badge.
export function plannerTypeBadgeTone(type: string): PlannerTypeTone {
  switch (type) {
    case "goal":
      return "done";
    case "plan":
      return "info";
    case "task":
      return "type";
    case "travel":
    case "template":
      return "neutral";
    default:
      return "neutral";
  }
}
