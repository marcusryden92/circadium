import type {
  BootstrapPayload,
  DatabaseChanges,
  SyncRequest,
  SyncResponse,
} from "@circadium/shared/contracts";
import { ApiError, apiRequest } from "@/lib/api/client";

/**
 * Answers from the host's proxy rather than the API: the request may never have
 * reached the server, so the sync loop retries it like a dropped connection.
 * A retry is safe either way, because a sync that did commit has moved the
 * account's version on and its replay comes back stale.
 */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** Everything the calendar needs to stand up, read in one snapshot. */
export function fetchCalendarBootstrap(): Promise<BootstrapPayload> {
  return apiRequest<BootstrapPayload>("/calendar/bootstrap", {
    authenticated: true,
  });
}

/**
 * The sync transport for the shared sync loop. It resolves with an outcome for
 * every answer the API gives, and throws only when there was no answer, which
 * is the one case the loop retries: a rejected diff fails the same way every
 * time, so replaying it would only delay the snap-back.
 */
export async function syncCalendarChanges(
  changes: DatabaseChanges,
  clientKnownDataVersion: number,
): Promise<SyncResponse> {
  const request: SyncRequest = { changes, clientKnownDataVersion };
  try {
    const { newDataVersion } = await apiRequest<{ newDataVersion: number }>(
      "/calendar/sync",
      { body: request, authenticated: true },
    );
    return { success: true, newDataVersion };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 0 || GATEWAY_STATUSES.has(error.status)) throw error;

    const freshState = error.problem.freshState;
    if (
      error.status === 409 &&
      error.code === "stale" &&
      freshState !== null &&
      typeof freshState === "object"
    ) {
      return {
        success: false,
        reason: "stale",
        freshState: freshState as BootstrapPayload,
      };
    }
    return { success: false, reason: "error", error: error.message };
  }
}
