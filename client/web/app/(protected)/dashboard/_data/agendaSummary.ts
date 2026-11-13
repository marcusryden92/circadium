import type { AgendaItem, DashboardSummary, UncompletedItem } from "./types";

export function summarizeAgenda(agenda: AgendaItem[]): DashboardSummary {
  let plannedMinutes = 0;
  let overdueCount = 0;
  let pastDeadlineCount = 0;
  let itemCount = 0;
  for (const item of agenda) {
    if (item.travel) continue;
    itemCount++;
    plannedMinutes += item.durationMinutes;
    if (item.overdue) overdueCount++;
    if (item.pastDeadline) pastDeadlineCount++;
  }
  return { itemCount, plannedMinutes, overdueCount, pastDeadlineCount };
}

// Strips out (1) anything whose end time has already passed today and
// (2) anything pulled into the uncompleted rollover, so today's agenda
// reads as "what's still upcoming" without duplicates.
export function pruneAgendaForRollover(
  agenda: AgendaItem[],
  now: Date,
  uncompleted: UncompletedItem[],
): AgendaItem[] {
  const uncompletedPlannerIds = new Set(uncompleted.map((u) => u.plannerId));
  const nowMs = now.getTime();
  return agenda.filter((item) => {
    if (item.end.getTime() <= nowMs) return false;
    if (item.plannerId && uncompletedPlannerIds.has(item.plannerId))
      return false;
    return true;
  });
}
