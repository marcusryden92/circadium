export type CalendarRenderer = "fullcalendar" | "own";

// /calendar?renderer=own opts into the own renderer; anything else, including
// no parameter at all, keeps FullCalendar.
export function rendererFromParam(value: string | null): CalendarRenderer {
  return value === "own" ? "own" : "fullcalendar";
}
