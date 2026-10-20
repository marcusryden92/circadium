"use client";

import { useState } from "react";
import {
  Button,
  ConfirmModal,
  Field,
  Input,
  SegmentedControl,
  useAiAccess,
} from "@/components/ui";
import { AiMode } from "@/generated/client";
import { AI_MODELS, type AiModelId } from "@/lib/aiModels";
import type { ServerActionStatus } from "@/hooks/useServerAction";
import { StatusLine } from "../StatusLine";
import { card, cardTitle, fieldNote, footerRow } from "../../page.css";

type ModeChoice = "byok" | "off";

// The mode lives on the server (it gates every AI entry point); the key never
// does — it sits encrypted in this device's vault, so the key card is
// explicitly per-device.
export function AISection() {
  const { mode, status, keyHint, model, saveKey, removeKey, setMode, setModel } =
    useAiAccess();

  const [modeStatus, setModeStatus] = useState<ServerActionStatus>(null);
  const [modeBusy, setModeBusy] = useState(false);

  const [modelBusy, setModelBusy] = useState(false);

  const [keyDraft, setKeyDraft] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyStatus, setKeyStatus] = useState<ServerActionStatus>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const modeChoice: ModeChoice = mode === AiMode.BYOK ? "byok" : "off";

  const handleModeChange = async (next: ModeChoice) => {
    if (modeBusy) return;
    const target = next === "byok" ? AiMode.BYOK : AiMode.OFF;
    if (target === mode) return;
    setModeBusy(true);
    setModeStatus(null);
    try {
      await setMode(target);
      setModeStatus({
        tone: "success",
        text: target === AiMode.BYOK ? "Assistant enabled." : "Assistant turned off.",
      });
    } catch {
      setModeStatus({ tone: "error", text: "Couldn't update — try again." });
    }
    setModeBusy(false);
  };

  const handleModelChange = async (next: AiModelId) => {
    if (modelBusy || next === model) return;
    setModelBusy(true);
    try {
      await setModel(next);
    } catch {
      // setModel reverts local state on failure; nothing else to do here.
    }
    setModelBusy(false);
  };

  const selectedModel = AI_MODELS.find((m) => m.id === model);

  const handleSaveKey = async () => {
    if (keyBusy || keyDraft.trim().length === 0) return;
    setKeyBusy(true);
    setKeyStatus(null);
    const result = await saveKey(keyDraft);
    setKeyBusy(false);
    if (result.ok) {
      setKeyDraft("");
      setKeyStatus({ tone: "success", text: "Key validated and stored on this device." });
    } else {
      setKeyStatus({ tone: "error", text: result.message });
    }
  };

  const handleRemoveKey = async () => {
    setConfirmRemove(false);
    await removeKey();
    setKeyStatus({ tone: "success", text: "Key removed from this device." });
  };

  return (
    <>
      <div className={card}>
        <span className={cardTitle}>Assistant access</span>
        <SegmentedControl<ModeChoice>
          options={[
            { key: "byok", label: "My own API key" },
            { key: "off", label: "Off" },
          ]}
          value={modeChoice}
          onChange={(next) => void handleModeChange(next)}
        />
        <span className={fieldNote}>
          The assistant runs on your own Anthropic API key — usage is billed to
          your Anthropic account, never to Circadium. A hosted option (no key
          needed) is planned.
        </span>
        <div className={footerRow}>
          <StatusLine status={modeStatus} />
        </div>
      </div>

      {mode === AiMode.BYOK && (
        <div className={card}>
          <span className={cardTitle}>Default model</span>
          <SegmentedControl<AiModelId>
            options={AI_MODELS.map((m) => ({ key: m.id, label: m.label }))}
            value={model}
            onChange={(next) => void handleModelChange(next)}
          />
          <span className={fieldNote}>
            {selectedModel?.blurb} You can also switch models from the model menu
            inside the assistant.
          </span>
        </div>
      )}

      <div className={card}>
        <span className={cardTitle}>API key on this device</span>
        {status === "ready" && keyHint ? (
          <span className={fieldNote}>
            A key (<strong>{keyHint}</strong>) is stored encrypted on this
            device. Paste a new key below to replace it.
          </span>
        ) : (
          <span className={fieldNote}>
            {mode === AiMode.BYOK
              ? "No key on this device yet. Keys are stored per device — paste yours below."
              : "Add a key to use the assistant. It is stored encrypted on this device only and never sent to our servers."}
          </span>
        )}
        <Field label={keyHint ? "Replace key" : "API key"}>
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            disabled={keyBusy}
          />
        </Field>
        <span className={fieldNote}>
          Create or copy a key at{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            console.anthropic.com
          </a>
          . Validated with a free call before it is stored; other devices need
          the key entered separately.
        </span>
        <div className={footerRow}>
          <StatusLine status={keyStatus} />
          {keyHint && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRemove(true)}
              disabled={keyBusy}
            >
              Remove key
            </Button>
          )}
          <Button
            variant="solid"
            size="sm"
            onClick={() => void handleSaveKey()}
            disabled={keyBusy || keyDraft.trim().length === 0}
          >
            {keyBusy ? "Checking…" : "Validate & save"}
          </Button>
        </div>
      </div>

      <ConfirmModal
        open={confirmRemove}
        title="Remove the key from this device?"
        body="The assistant stops working on this device until a key is added again. Your Anthropic account is not affected."
        confirmLabel="Remove key"
        cancelLabel="Keep it"
        tone="danger"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => void handleRemoveKey()}
      />
    </>
  );
}
