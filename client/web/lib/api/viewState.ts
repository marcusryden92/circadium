import { apiRequest } from "@/lib/api/client";

// Canvas view preferences (graph + mindmap), one row per user on the Java
// API. Each save patches only its own canvas's column; outside the OCC diff
// sync, so view tweaks never bump dataVersion.

export type ViewStateKind = "graph" | "mindmap";

export function getViewState(): Promise<{
  graph: string | null;
  mindmap: string | null;
}> {
  return apiRequest("/view-state", { authenticated: true });
}

export function saveViewState(
  kind: ViewStateKind,
  state: string | null,
): Promise<void> {
  return apiRequest<void>("/view-state", {
    method: "PUT",
    body: { kind, state },
    authenticated: true,
  });
}
