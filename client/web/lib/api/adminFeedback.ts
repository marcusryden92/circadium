import { apiRequest } from "@/lib/api/client";

// The ADMIN-only report inspector, on the Java API (plan 2.4). The API admits
// only an ADMIN whose sign-in passed the emailed 2FA code; the page's own
// isAdmin check merely explains a refusal.

export interface FeedbackReportSummary {
  id: string;
  message: string;
  createdAt: string;
  hasSnapshot: boolean;
  userName: string | null;
  userEmail: string | null;
}

export function listFeedbackReports(): Promise<FeedbackReportSummary[]> {
  return apiRequest<FeedbackReportSummary[]>("/admin/feedback-reports", {
    authenticated: true,
  });
}

export function getFeedbackReportSnapshot(
  id: string,
): Promise<Record<string, unknown> | null> {
  return apiRequest<Record<string, unknown> | null>(
    `/admin/feedback-reports/${encodeURIComponent(id)}/snapshot`,
    { authenticated: true },
  );
}

/** GDPR hygiene: drops just the snapshot once a report is resolved. */
export function clearFeedbackSnapshot(id: string): Promise<void> {
  return apiRequest<void>(
    `/admin/feedback-reports/${encodeURIComponent(id)}/snapshot`,
    { method: "DELETE", authenticated: true },
  );
}

export function deleteFeedbackReport(id: string): Promise<void> {
  return apiRequest<void>(
    `/admin/feedback-reports/${encodeURIComponent(id)}`,
    { method: "DELETE", authenticated: true },
  );
}
