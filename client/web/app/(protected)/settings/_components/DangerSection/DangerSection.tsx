"use client";

import { space } from "@/lib/theme";
import { useState } from "react";
import { Button, ConfirmModal, Field, Input } from "@/components/ui";
import { requestAccountDeletion } from "@/actions/deleteAccount";
import { useServerAction } from "@/hooks/useServerAction";
import { StatusLine } from "../StatusLine";
import { card, cardTitle, dangerNote, footerRow } from "../../page.css";

interface DangerSectionProps {
  user: {
    email?: string;
    isOAuth?: boolean;
  };
}

export function DangerSection({ user }: DangerSectionProps) {
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const { run, status, isPending, setError, setSuccess, clear } =
    useServerAction(requestAccountDeletion);

  const email = (user.email ?? "").trim().toLowerCase();
  const requirePassword = !user.isOAuth;
  const emailMatches =
    email.length > 0 && confirmEmail.trim().toLowerCase() === email;
  const canRequest =
    emailMatches && (!requirePassword || password.length > 0) && !isPending;

  const closeModal = () => {
    if (isPending) return;
    setOpen(false);
    setConfirmEmail("");
    setPassword("");
    clear();
  };

  const handleConfirm = async () => {
    if (!canRequest) return;
    clear();
    const result = await run({
      confirmEmail,
      password: requirePassword ? password : undefined,
    });
    if (!result) return;
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.success) {
      setSuccess(result.success);
      setOpen(false);
      setConfirmEmail("");
      setPassword("");
    }
  };

  return (
    <div className={card}>
      <span className={cardTitle}>Account deletion</span>
      <div className={dangerNote}>
        This will permanently remove your account and every piece of data tied
        to it — planners, categories, locations, templates, calendar events,
        and travel times. You&apos;ll receive a confirmation email; the account
        is only deleted after you click the link inside.
      </div>
      <div className={footerRow}>
        <StatusLine status={status} />
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            clear();
            setOpen(true);
          }}
          disabled={isPending}
        >
          Delete account
        </Button>
      </div>

      <ConfirmModal
        open={open}
        title="Send deletion confirmation email?"
        tone="danger"
        confirmLabel={isPending ? "Sending…" : "Send confirmation email"}
        cancelLabel="Cancel"
        confirmDisabled={!canRequest}
        onCancel={closeModal}
        onConfirm={handleConfirm}
        body={
          <div style={{ display: "flex", flexDirection: "column", gap: space["3.5"] }}>
            <p style={{ margin: 0 }}>
              We&apos;ll email you a link that finalizes the deletion. The link
              expires in 30 minutes. Nothing is deleted until you click it.
            </p>
            <Field
              label={`Type your email to confirm${email ? ` (${email})` : ""}`}
            >
              <Input
                type="email"
                autoComplete="off"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                disabled={isPending}
                placeholder={email || "your@email.com"}
              />
            </Field>
            {requirePassword && (
              <Field label="Password">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isPending}
                />
              </Field>
            )}
            {status?.tone === "error" && (
              <span
                style={{ fontSize: 12, color: "inherit", opacity: 0.85 }}
                aria-live="polite"
              >
                {status.text}
              </span>
            )}
          </div>
        }
      />
    </div>
  );
}
