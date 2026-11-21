"use client";

import { useState } from "react";
import { ConfirmModal, Field, PasswordInput } from "@/components/ui";
import { setTwoFactor } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
import { useServerAction } from "@/hooks/useServerAction";
import { space } from "@/lib/theme";
import { StatusLine } from "../StatusLine";
import {
  card,
  cardTitle,
  toggleRow,
  toggleMain,
  toggleHead,
  toggleBody,
  toggleSwitch,
  toggleSwitchOn,
  toggleKnob,
  toggleKnobOn,
  footerRow,
} from "../../page.css";

async function saveTwoFactor(values: {
  currentPassword: string;
  enabled: boolean;
}): Promise<{ success?: string; error?: string }> {
  try {
    await setTwoFactor(values);
    return {
      success: values.enabled
        ? "Two-factor authentication enabled."
        : "Two-factor authentication disabled.",
    };
  } catch (error) {
    return { error: describeApiError(error) };
  }
}

interface TwoFactorCardProps {
  initialEnabled: boolean;
}

/**
 * The switch asks for the current password before it changes anything, so a
 * borrowed session cannot quietly turn the second factor off. Java emails the
 * account about every change.
 */
export function TwoFactorCard({ initialEnabled }: TwoFactorCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const { run, status, isPending, setSuccess, setError, clear } =
    useServerAction(saveTwoFactor);

  const next = !enabled;

  const close = () => {
    if (isPending) return;
    setConfirming(false);
    setPassword("");
  };

  const confirm = async () => {
    if (password.length === 0) return;
    clear();
    const result = await run({ currentPassword: password, enabled: next });
    if (!result) return;
    if (result.error) {
      setError(result.error);
      return;
    }
    setEnabled(next);
    setSuccess(result.success ?? "");
    setConfirming(false);
    setPassword("");
  };

  return (
    <div className={card}>
      <span className={cardTitle}>Two-factor authentication</span>
      <div className={toggleRow}>
        <div className={toggleMain}>
          <div className={toggleHead}>Email verification on sign-in</div>
          <div className={toggleBody}>
            {enabled
              ? "On — we email a code each time you sign in."
              : "Off — sign-in only requires your password."}
          </div>
        </div>
        <button
          type="button"
          className={`${toggleSwitch} ${enabled ? toggleSwitchOn : ""}`}
          onClick={() => {
            clear();
            setConfirming(true);
          }}
          disabled={isPending}
          aria-pressed={enabled}
          aria-label="Toggle two-factor authentication"
        >
          <span className={`${toggleKnob} ${enabled ? toggleKnobOn : ""}`} />
        </button>
      </div>
      {status && !confirming && (
        <div className={footerRow}>
          <StatusLine status={status} />
        </div>
      )}

      <ConfirmModal
        open={confirming}
        title={next ? "Turn on two-factor sign-in?" : "Turn off two-factor sign-in?"}
        tone={next ? undefined : "danger"}
        confirmLabel={isPending ? "Saving…" : next ? "Turn on" : "Turn off"}
        cancelLabel="Cancel"
        confirmDisabled={password.length === 0 || isPending}
        onCancel={close}
        onConfirm={confirm}
        body={
          <div style={{ display: "flex", flexDirection: "column", gap: space["3.5"] }}>
            <p style={{ margin: 0 }}>
              {next
                ? "Each sign-in will also need a code we email you."
                : "Signing in will need only your password."}{" "}
              Enter your password to confirm.
            </p>
            <Field label="Password">
              <PasswordInput
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
              />
            </Field>
            {status?.tone === "error" && (
              <span style={{ fontSize: 12, opacity: 0.85 }} aria-live="polite">
                {status.text}
              </span>
            )}
          </div>
        }
      />
    </div>
  );
}
