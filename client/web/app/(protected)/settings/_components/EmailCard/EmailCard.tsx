"use client";

import { useState } from "react";
import { Button, Field, Input, PasswordInput } from "@/components/ui";
import { requestEmailChange } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
import { useServerAction } from "@/hooks/useServerAction";
import { EmailChangeSchema } from "@/schemas";
import { StatusLine } from "../StatusLine";
import { card, cardTitle, fieldNote, footerRow } from "../../page.css";

async function sendEmailChange(values: {
  currentPassword: string;
  newEmail: string;
}): Promise<{ success?: string; error?: string }> {
  try {
    await requestEmailChange(values);
    return {
      success: `We sent a link to ${values.newEmail}. Your email changes once you open it.`,
    };
  } catch (error) {
    return { error: describeApiError(error) };
  }
}

interface EmailCardProps {
  user: { email?: string; isOAuth?: boolean };
}

/**
 * Changing the sign-in email needs the current password: with only a session,
 * someone could move the account to their own address and then reset the
 * password from there. The current address is told about the request.
 */
export function EmailCard({ user }: EmailCardProps) {
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const { run, status, isPending, setSuccess, setError, clear } =
    useServerAction(sendEmailChange);

  const dirty = email.trim().toLowerCase() !== (user.email ?? "").toLowerCase();
  const disabled = !!user.isOAuth;

  const onSave = async () => {
    clear();
    const parsed = EmailChangeSchema.safeParse({
      currentPassword: password,
      newEmail: email,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details and try again.");
      return;
    }
    const result = await run(parsed.data);
    if (!result) return;
    if (result.error) {
      setError(result.error);
    } else if (result.success) {
      setSuccess(result.success);
      setPassword("");
    }
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
          autoComplete="email"
        />
      </Field>
      {!disabled && dirty && (
        <Field label="Your password">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={isPending}
          />
        </Field>
      )}
      <span className={fieldNote}>
        {disabled
          ? "Your email is managed by your OAuth provider — change it there."
          : "Changing email sends a link to the new address and a notice to the current one. The change isn't applied until you open the link."}
      </span>
      {!disabled && (
        <div className={footerRow}>
          <StatusLine status={status} />
          <Button
            variant="solid"
            size="sm"
            onClick={onSave}
            disabled={!dirty || password.length === 0 || isPending}
          >
            {isPending ? "Sending…" : "Send verification"}
          </Button>
        </div>
      )}
    </div>
  );
}
