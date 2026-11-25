import { apiRequest } from "@/lib/api/client";

// Support messages + the suggestion wall, on the Java API (plan 2.4). Entirely
// outside the OCC diff sync — nothing here touches calendar data or
// dataVersion. Failures throw ApiError whose message is the API's detail
// string (the same user-facing wording the retired actions threw), which
// useServerAction surfaces as-is.

export interface SuggestionView {
  id: string;
  title: string;
  body: string | null;
  authorName: string;
  isMine: boolean;
  score: number;
  upvotes: number;
  downvotes: number;
  myVote: number;
  createdAt: string;
}

export function sendSupportMessage(input: {
  message: string;
  includeSnapshot: boolean;
}): Promise<{ reportId: string }> {
  return apiRequest<{ reportId: string }>("/feedback/support", {
    body: input,
    authenticated: true,
  });
}

export function getSuggestions(): Promise<SuggestionView[]> {
  return apiRequest<SuggestionView[]>("/suggestions", { authenticated: true });
}

export function createSuggestion(input: {
  title: string;
  body?: string;
}): Promise<SuggestionView> {
  return apiRequest<SuggestionView>("/suggestions", {
    body: input,
    authenticated: true,
  });
}

export function voteSuggestion(
  suggestionId: string,
  value: 1 | -1 | 0,
): Promise<void> {
  return apiRequest<void>(
    `/suggestions/${encodeURIComponent(suggestionId)}/vote`,
    { method: "PUT", body: { value }, authenticated: true },
  );
}

/** Deletes own suggestions; the API lets an ADMIN session delete anyone's. */
export function deleteSuggestion(id: string): Promise<void> {
  return apiRequest<void>(`/suggestions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    authenticated: true,
  });
}
