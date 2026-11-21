"use client";

import { Button, Field, PasswordInput, PasswordStrength } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/schemas";
import { StatusLine } from "../StatusLine";
import { card, cardTitle, fieldGrid, footerRow } from "../../page.css";
import { usePasswordChange } from "./usePasswordChange";

interface PasswordCardProps {
  /** Passed to the strength meter: a password built from it is easy to guess. */
  email?: string;
}

export function PasswordCard({ email }: PasswordCardProps) {
  const { values, setters, status, isPending, filled, submit } =
    usePasswordChange();

  return (
    <div className={card}>
      <span className={cardTitle}>Password</span>
      <div className={fieldGrid}>
        <Field label="Current">
          <PasswordInput
            value={values.password}
            onChange={(e) => setters.setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={isPending}
          />
        </Field>
        {/* The meter sits outside the <label> so its text is not read as the field's name. */}
        <div>
          <Field label="New">
            <PasswordInput
              value={values.newPassword}
              onChange={(e) => setters.setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={isPending}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            />
          </Field>
          <PasswordStrength
            password={values.newPassword}
            userInputs={email ? [email] : []}
          />
        </div>
        <Field label="Confirm new">
          <PasswordInput
            value={values.confirmNewPassword}
            onChange={(e) => setters.setConfirmNewPassword(e.target.value)}
            autoComplete="new-password"
            disabled={isPending}
            placeholder="Retype new"
          />
        </Field>
      </div>
      <div className={footerRow}>
        <StatusLine status={status} />
        <Button
          variant="solid"
          size="sm"
          onClick={submit}
          disabled={!filled || isPending}
        >
          {isPending ? "Saving…" : "Update password"}
        </Button>
      </div>
    </div>
  );
}
