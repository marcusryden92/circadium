"use client";

import { useCallback, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { History, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  deleteDraftConversation,
  getDraftConversation,
  listDraftConversations,
  type DraftConversationMessage,
  type DraftConversationSummary,
} from "@/actions/draftConversations";
import { headerActionButton } from "@/components/draft/AIDraftModal/AIDraftModal.css";
import {
  menu,
  stateRow,
  conversationRow,
  conversationButton,
  conversationTitle,
  conversationDate,
  deleteButton,
} from "./ChatHistoryPopover.css";

interface ChatHistoryPopoverProps {
  currentConversationId: string;
  disabled: boolean;
  onAdopt: (payload: {
    id: string;
    messages: DraftConversationMessage[];
  }) => void;
  // Fired when the conversation currently open in the chat pane is deleted.
  onDeletedCurrent: () => void;
}

export function ChatHistoryPopover({
  currentConversationId,
  disabled,
  onAdopt,
  onDeletedCurrent,
}: ChatHistoryPopoverProps) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<
    DraftConversationSummary[] | null
  >(null);
  const [errored, setErrored] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setErrored(false);
      setConversations(await listDraftConversations());
    } catch {
      setErrored(true);
      setConversations([]);
    }
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        setConversations(null);
        void refresh();
      }
    },
    [refresh],
  );

  const handleSelect = useCallback(
    async (id: string) => {
      try {
        const conversation = await getDraftConversation(id);
        onAdopt({ id: conversation.id, messages: conversation.messages });
        setOpen(false);
      } catch {
        setErrored(true);
      }
    },
    [onAdopt],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteDraftConversation(id);
      } catch {
        return;
      }
      if (id === currentConversationId) onDeletedCurrent();
      void refresh();
    },
    [currentConversationId, onDeletedCurrent, refresh],
  );

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={headerActionButton}
          disabled={disabled}
          aria-label="Chat history"
        >
          <History size={12} strokeWidth={2.2} aria-hidden /> History
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={menu} align="end" sideOffset={6}>
          {conversations === null ? (
            <div className={stateRow}>Loading…</div>
          ) : errored ? (
            <div className={stateRow}>Couldn&apos;t load history.</div>
          ) : conversations.length === 0 ? (
            <div className={stateRow}>No conversations yet.</div>
          ) : (
            conversations.map((c) => (
              <div key={c.id} className={conversationRow}>
                <button
                  type="button"
                  className={conversationButton}
                  data-current={
                    c.id === currentConversationId ? "true" : undefined
                  }
                  onClick={() => void handleSelect(c.id)}
                >
                  <span className={conversationTitle}>{c.title}</span>
                  <span className={conversationDate}>
                    {formatUpdatedAt(c.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className={deleteButton}
                  onClick={() => void handleDelete(c.id)}
                  aria-label={`Delete "${c.title}"`}
                >
                  <Trash2 size={12} strokeWidth={2} aria-hidden />
                </button>
              </div>
            ))
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true });
}
