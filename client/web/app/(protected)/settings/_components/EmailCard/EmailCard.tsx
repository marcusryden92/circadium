"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { settings } from "@/actions/settings";
import { useServerAction } from "@/hooks/useServerAction";
import type { UserRole } from "@/generated/client";
import { StatusLine } from "../StatusLine";
import { card, cardTitle, fieldNote, footerRow } from "../../page.css";

interface EmailCardProps {
  user: { email?: string; role: UserRole; isOAuth?: boolean };
}

export function EmailCard({ user }: EmailCardProps) {
  const [email, setEmail] = useState(user.email ?? "");
  const { run, status, isPending, setSuccess, setError, clear } =
    useServerAction(settings);

  const dirty = email.trim() !== (user.email ?? "");
  const disabled = !!user.isOAuth;

  const onSave = async () => {
    clear();
    const result = await run({
      email: email.trim() || undefined,
      role: user.role,
    });
    if (!result) return;
    if (result.error) setError(result.error);
    else if (result.success) setSuccess(result.success);
  };

  return (
    <div className={card}>
      <span className={cardTitle}>Email</span>
      <Field label="Current">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled || isPending}
        />
      </Field>
      <span className={fieldNote}>
        {disabled
          ? "Your email is managed by your OAuth provider — change it there."
          : "Changing email sends a verification link to the new address. The change isn't applied until you click the link."}
      </span>
      {!disabled && (
        <div className={footerRow}>
          <StatusLine status={status} />
          <Button
            variant="solid"
            size="sm"
            onClick={onSave}
            disabled={!dirty || isPending}
          >
            {isPending ? "Sending…" : "Send verification"}
          </Button>
        </div>
      )}
    </div>
  );
}
