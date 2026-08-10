"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  Button,
  ConfirmModal,
  Input,
  Loader,
  vars,
} from "@/components/ui";
import { useServerAction } from "@/hooks/useServerAction";
import { useCurrentRole } from "@/hooks/useCurrentRole";
import {
  createSuggestion,
  deleteSuggestion,
  getSuggestions,
  voteSuggestion,
  type SuggestionView,
} from "@/actions/feedback";
import {
  card,
  cardHead,
  composer,
  composerHint,
  bodyArea,
  composerFooter,
  statusText,
  list,
  emptyList,
  row,
  voteColumn,
  voteButton,
  voteScore,
  rowMain,
  rowTitle,
  rowBody,
  rowMeta,
  rowDelete,
  loadingWrap,
} from "./SuggestionWall.css";

const MIN_TITLE_CHARS = 3;

const sortSuggestions = (items: SuggestionView[]): SuggestionView[] =>
  [...items].sort(
    (a, b) =>
      b.score - a.score ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id),
  );

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

export function SuggestionWall() {
  const isAdmin = useCurrentRole() === "ADMIN";
  const [suggestions, setSuggestions] = useState<SuggestionView[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { run: runCreate, status, isPending, clear } =
    useServerAction(createSuggestion);

  const reload = useCallback(async () => {
    try {
      setSuggestions(await getSuggestions());
      setLoadError(null);
    } catch {
      setLoadError("Could not load suggestions — try refreshing.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ordered = useMemo(
    () => (suggestions ? sortSuggestions(suggestions) : null),
    [suggestions],
  );

  const handlePost = async () => {
    clear();
    const created = await runCreate({ title, body: body || undefined });
    if (created) {
      setSuggestions((prev) => [created, ...(prev ?? [])]);
      setTitle("");
      setBody("");
    }
  };

  // Optimistic: flip the local vote immediately, reconcile with a reload only
  // if the server refuses.
  const handleVote = (target: SuggestionView, direction: 1 | -1) => {
    const next = target.myVote === direction ? 0 : direction;
    setSuggestions((prev) =>
      (prev ?? []).map((s) => {
        if (s.id !== target.id) return s;
        const upvotes = s.upvotes - (s.myVote === 1 ? 1 : 0) + (next === 1 ? 1 : 0);
        const downvotes =
          s.downvotes - (s.myVote === -1 ? 1 : 0) + (next === -1 ? 1 : 0);
        return { ...s, myVote: next, upvotes, downvotes, score: upvotes - downvotes };
      }),
    );
    voteSuggestion(target.id, next).catch(() => void reload());
  };

  const handleConfirmDelete = () => {
    if (!deletingId) return;
    const id = deletingId;
    setDeletingId(null);
    setSuggestions((prev) => (prev ?? []).filter((s) => s.id !== id));
    deleteSuggestion(id).catch(() => void reload());
  };

  const deleting = deletingId
    ? suggestions?.find((s) => s.id === deletingId)
    : undefined;

  return (
    <section className={card}>
      <div className={cardHead}>Suggestions</div>
      <div className={composer}>
        <p className={composerHint}>
          Missing a feature? Post it here and vote on others — the most wanted
          ideas rise to the top.
        </p>
        <Input
          variant="boxed"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Suggest a feature or improvement"
          disabled={isPending}
          aria-label="Suggestion title"
        />
        <textarea
          className={bodyArea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Details (optional)"
          disabled={isPending}
          aria-label="Suggestion details"
        />
        <div className={composerFooter}>
          <Button
            size="sm"
            onClick={handlePost}
            disabled={isPending || title.trim().length < MIN_TITLE_CHARS}
          >
            {isPending ? "Posting…" : "Post suggestion"}
          </Button>
          {status && (
            <span
              className={statusText}
              style={{
                color:
                  status.tone === "error"
                    ? vars.status.error
                    : vars.status.success,
              }}
            >
              {status.text}
            </span>
          )}
        </div>
      </div>

      {ordered === null ? (
        <div className={loadingWrap}>
          <Loader size="md" label="Loading suggestions" />
        </div>
      ) : loadError ? (
        <div className={emptyList}>{loadError}</div>
      ) : ordered.length === 0 ? (
        <div className={emptyList}>
          No suggestions yet — be the first to post one.
        </div>
      ) : (
        <div className={list}>
          {ordered.map((s) => (
            <div key={s.id} className={row}>
              <div className={voteColumn}>
                <button
                  type="button"
                  className={voteButton}
                  data-active={s.myVote === 1}
                  onClick={() => handleVote(s, 1)}
                  aria-label="Vote up"
                >
                  <ChevronUp size={16} strokeWidth={2.4} />
                </button>
                <span className={voteScore}>{s.score}</span>
                <button
                  type="button"
                  className={voteButton}
                  data-active={s.myVote === -1}
                  onClick={() => handleVote(s, -1)}
                  aria-label="Vote down"
                >
                  <ChevronDown size={16} strokeWidth={2.4} />
                </button>
              </div>
              <div className={rowMain}>
                <span className={rowTitle}>{s.title}</span>
                {s.body && <p className={rowBody}>{s.body}</p>}
                <span className={rowMeta}>
                  {s.authorName} · {formatDate(s.createdAt)}
                </span>
              </div>
              {(s.isMine || isAdmin) && (
                <button
                  type="button"
                  className={rowDelete}
                  onClick={() => setDeletingId(s.id)}
                  aria-label="Delete suggestion"
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deletingId}
        title="Delete suggestion?"
        tone="danger"
        confirmLabel="Delete"
        body={
          <p style={{ margin: 0 }}>
            Delete &ldquo;{deleting?.title ?? "this suggestion"}&rdquo; and its
            votes?
          </p>
        }
        onCancel={() => setDeletingId(null)}
        onConfirm={handleConfirmDelete}
      />
    </section>
  );
}
