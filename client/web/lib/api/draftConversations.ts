import { apiRequest } from "@/lib/api/client";

export interface DraftConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolNote?: string;
}

export interface DraftConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface DraftConversationPayload extends DraftConversationSummary {
  messages: DraftConversationMessage[];
}

export function listDraftConversations(): Promise<DraftConversationSummary[]> {
  return apiRequest<DraftConversationSummary[]>("/draft-conversations", {
    authenticated: true,
  });
}

export function getDraftConversation(id: string): Promise<DraftConversationPayload> {
  return apiRequest<DraftConversationPayload>(
    `/draft-conversations/${encodeURIComponent(id)}`,
    { authenticated: true },
  );
}

export function upsertDraftConversation(input: {
  id: string;
  title: string;
  messages: DraftConversationMessage[];
}): Promise<void> {
  return apiRequest<void>(
    `/draft-conversations/${encodeURIComponent(input.id)}`,
    {
      method: "PUT",
      body: { title: input.title, messages: input.messages },
      authenticated: true,
    },
  );
}

export function deleteDraftConversation(id: string): Promise<void> {
  return apiRequest<void>(
    `/draft-conversations/${encodeURIComponent(id)}`,
    { method: "DELETE", authenticated: true },
  );
}
