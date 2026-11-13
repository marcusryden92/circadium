export interface CalendarColorGroup {
  name: string;
  colors: string[];
}

// The item/template color palette, grouped by family. The picker renders one
// row per group; every flat consumer (fallbacks, the WeekStructureModal grid)
// reads the flattened `calendarColors` below.
export const CALENDAR_COLOR_GROUPS: CalendarColorGroup[] = [
  { name: "Reds", colors: ["#FCA5A5", "#F87171", "#EF4444", "#DC2626", "#991B1B"] },
  { name: "Oranges", colors: ["#FDBA74", "#FB923C", "#F97316", "#EA580C", "#C2410C"] },
  { name: "Yellows", colors: ["#FDE68A", "#FCD34D", "#FBBF24", "#F59E0B", "#D97706"] },
  { name: "Greens", colors: ["#86EFAC", "#4ADE80", "#22C55E", "#16A34A", "#15803D"] },
  { name: "Teals", colors: ["#5EEAD4", "#2DD4BF", "#14B8A6", "#0D9488", "#0F766E"] },
  { name: "Blues", colors: ["#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1E3A8A"] },
  { name: "Purples", colors: ["#C4B5FD", "#A78BFA", "#8B5CF6", "#7C3AED", "#6D28D9"] },
  { name: "Pinks", colors: ["#F9A8D4", "#F472B6", "#EC4899", "#DB2777", "#BE185D"] },
  { name: "Beige", colors: ["#F5EBDC", "#EAD9C0", "#DCC6A0", "#C9A87C", "#A98467"] },
  { name: "Cool grays", colors: ["#E2E8F0", "#CBD5E1", "#94A3B8", "#64748B", "#334155"] },
  { name: "Mono", colors: ["#000000", "#FFFFFF"] },
];

// Flattened palette — the shape every existing consumer already expects.
export const calendarColors: string[] = CALENDAR_COLOR_GROUPS.flatMap(
  (group) => group.colors,
);

// The families a deterministic fallback color may be drawn from: vivid hues
// only. Neutrals, black, and white are pickable by hand but excluded here so an
// auto-assigned color is never invisible (white) or muddy.
const NEUTRAL_GROUPS = new Set(["Beige", "Cool grays", "Mono"]);
export const FALLBACK_COLORS: string[] = CALENDAR_COLOR_GROUPS.filter(
  (group) => !NEUTRAL_GROUPS.has(group.name),
).flatMap((group) => group.colors);
