"use client";

import { useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Button, Input, CenteredLoader, useAiAccess } from "@/components/ui";
import {
  wrap,
  panel,
  iconBadge,
  title,
  bodyText,
  keyForm,
  keyRow,
  keyInput,
  errorText,
  deviceNote,
  consoleLink,
  optOutRow,
} from "./AssistantGate.css";

// Rendered wherever the assistant UI would be when AI isn't usable yet:
// the user opted out (or never decided), or opted in but this device holds
// no key. Every entry point funnels into this one panel instead of being
// individually disabled.
export function AssistantGate({
  onOptOut,
  optOutLabel = "Skip AI for now",
}: {
  onOptOut?: () => void;
  optOutLabel?: string;
}) {
  const { status, saveKey } = useAiAccess();
  const [keyDraft, setKeyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <div className={wrap}>
        <CenteredLoader />
      </div>
    );
  }
  if (status === "ready") return null;

  const heading =
    status === "needs-key"
      ? "Your API key isn't on this device"
      : "Turn on the AI assistant";
  const body =
    status === "needs-key"
      ? "The assistant runs on your own Anthropic API key, stored separately on each device you use. Paste your key here once and this device is set."
      : "The assistant plans goals, weekly schedules, and categories with you — running on your own Anthropic API key. Usage is billed to your Anthropic account, and the key never touches our servers.";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || keyDraft.trim().length === 0) return;
    setBusy(true);
    setError(null);
    const result = await saveKey(keyDraft);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setKeyDraft("");
  };

  return (
    <div className={wrap}>
      <div className={panel}>
        <span className={iconBadge}>
          <Sparkles size={18} strokeWidth={2.2} />
        </span>
        <h2 className={title}>{heading}</h2>
        <p className={bodyText}>
          {body}{" "}
          <a
            className={consoleLink}
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            Create or copy a key in the Anthropic console
          </a>
          .
        </p>

        <form className={keyForm} onSubmit={handleSubmit}>
          <div className={keyRow}>
            <Input
              className={keyInput}
              variant="boxed"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              disabled={busy}
              aria-label="Anthropic API key"
            />
            <Button
              variant="glassInk"
              type="submit"
              disabled={busy || keyDraft.trim().length === 0}
            >
              {busy ? "Checking…" : "Validate & save"}
            </Button>
          </div>
          {error && <span className={errorText}>{error}</span>}
          <span className={deviceNote}>
            Stored encrypted on this device only — it is never sent to our
            servers. Replace or remove it any time under Settings → AI
            assistant.
          </span>
        </form>

        {onOptOut && (
          <div className={optOutRow}>
            <Button variant="ghost" size="sm" onClick={onOptOut} disabled={busy}>
              {optOutLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
