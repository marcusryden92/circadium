import type { OccurrenceCompletion } from "@/types/prisma";
import { apiRequest } from "@/lib/api/client";

// The occurrence-completion log (recurring tasks/goal leaves + plan
// check-offs), one row per (plannerId, occurrenceKey). Served by the Java API
// outside the OCC diff sync: logging a completion never bumps User.dataVersion
// or contends with the calendar transaction.

export function getOccurrenceCompletions(): Promise<OccurrenceCompletion[]> {
  return apiRequest<OccurrenceCompletion[]>(
    "/calendar/occurrence-completions",
    { authenticated: true },
  );
}

export function logOccurrenceCompletion(input: {
  plannerId: string;
  occurrenceKey: string;
  start: string;
  end: string;
}): Promise<OccurrenceCompletion> {
  return apiRequest<OccurrenceCompletion>("/calendar/occurrence-completions", {
    method: "PUT",
    body: input,
    authenticated: true,
  });
}

export function unlogOccurrenceCompletion(input: {
  plannerId: string;
  occurrenceKey: string;
}): Promise<void> {
  const query = new URLSearchParams(input).toString();
  return apiRequest<void>(`/calendar/occurrence-completions?${query}`, {
    method: "DELETE",
    authenticated: true,
  });
}
