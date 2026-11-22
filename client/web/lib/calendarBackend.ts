export type CalendarBackend = "java" | "actions";

/**
 * Which backend loads and syncs the calendar while the server actions still
 * exist beside the Java API. Unset means the server actions, so deploying the
 * switch changes nothing until the variable is set, and removing it rolls back.
 * Next inlines NEXT_PUBLIC_ values at build time: a change needs a redeploy.
 */
export function calendarBackend(): CalendarBackend {
  return process.env.NEXT_PUBLIC_CALENDAR_BACKEND === "java"
    ? "java"
    : "actions";
}
