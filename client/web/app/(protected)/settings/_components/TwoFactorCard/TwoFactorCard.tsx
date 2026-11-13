"use client";

import { useState } from "react";
import { settings } from "@/actions/settings";
import { useServerAction } from "@/hooks/useServerAction";
import type { UserRole } from "@/generated/client";
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

interface TwoFactorCardProps {
  initialEnabled: boolean;
  userRole: UserRole;
}

export function TwoFactorCard({
  initialEnabled,
  userRole,
}: TwoFactorCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const { run, status, isPending, setSuccess, setError, clear } =
    useServerAction(settings);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    clear();
    const result = await run({
      isTwoFactorEnabled: next,
      role: userRole,
    });
    if (!result) {
      setEnabled(!next);
      return;
    }
    if (result.error) {
      setEnabled(!next);
      setError(result.error);
    } else if (result.success) {
      setSuccess(
        next
          ? "Two-factor authentication enabled."
          : "Two-factor authentication disabled.",
      );
    }
  };

  return (
    <div className={card}>
      <span className={cardTitle}>Two-factor authentication</span>
      <div className={toggleRow}>
        <div className={toggleMain}>
          <div className={toggleHead}>Email verification on sign-in</div>
          <div className={toggleBody}>
            {enabled
              ? "On — we'll email a code each time you sign in from a new device."
              : "Off — sign-in only requires your password."}
          </div>
        </div>
        <button
          type="button"
          className={`${toggleSwitch} ${enabled ? toggleSwitchOn : ""}`}
          onClick={toggle}
          disabled={isPending}
          aria-pressed={enabled}
          aria-label="Toggle two-factor authentication"
        >
          <span className={`${toggleKnob} ${enabled ? toggleKnobOn : ""}`} />
        </button>
      </div>
      {status && (
        <div className={footerRow}>
          <StatusLine status={status} />
        </div>
      )}
    </div>
  );
}
