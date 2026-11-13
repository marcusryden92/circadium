"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ArrowUp, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui";
import type { ChatMessage } from "@/hooks/useAIDraftState";
import {
  wrap,
  messageList,
  empty,
  messageUser,
  messageAssistant,
  messageRole,
  messageContent,
  markdownBody,
  streamingDots,
  streamingDot,
  composer,
  textarea,
} from "./ChatPane.css";

interface ChatPaneProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  // Prefills the composer (not auto-sent) — used by entry points that carry a
  // canned prompt, e.g. the item-detail helper pills.
  initialDraft?: string | null;
  // Overrides the copy shown before any message is sent (e.g. onboarding).
  emptyHint?: ReactNode;
}

export function ChatPane({
  messages,
  onSend,
  onStop,
  isStreaming,
  initialDraft,
  emptyHint,
}: ChatPaneProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialDraft) setDraft(initialDraft);
  }, [initialDraft]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const send = () => {
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={wrap}>
      <div className={messageList} ref={listRef}>
        {messages.length === 0 ? (
          <div className={empty}>
            {emptyHint ?? (
              <>
                Ask for new goals, restructure existing ones, or clean things
                up.
                <br />
                The assistant proposes changes and updates the goals on the
                right.
              </>
            )}
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? messageUser : messageAssistant}
            >
              {m.role === "assistant" && (
                <span className={messageRole}>assistant</span>
              )}
              <span className={messageContent}>
                {m.role === "assistant" ? (
                  <span className={markdownBody}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </span>
                ) : (
                  m.content
                )}
                {m.streaming && (
                  <span className={streamingDots} aria-label="streaming">
                    <span className={streamingDot} />
                    <span className={streamingDot} />
                    <span className={streamingDot} />
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      <div className={composer}>
        <textarea
          ref={textareaRef}
          className={textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message the assistant…"
          rows={1}
        />
        {isStreaming ? (
          <Button
            variant="solid"
            size="sm"
            onClick={onStop}
            aria-label="Stop"
          >
            <Square size={11} strokeWidth={0} fill="currentColor" />
          </Button>
        ) : (
          <Button
            variant="solid"
            size="sm"
            onClick={send}
            disabled={draft.trim().length === 0}
            aria-label="Send"
          >
            <ArrowUp size={14} strokeWidth={2.4} />
          </Button>
        )}
      </div>
    </div>
  );
}
