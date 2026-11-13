"use client";

import { Button, Field, Input } from "@/components/ui";
import type { UserRole } from "@/generated/client";
import { StatusLine } from "../StatusLine";
import { card, cardTitle, fieldGrid, footerRow } from "../../page.css";
import { usePasswordChange } from "./usePasswordChange";

interface PasswordCardProps {
  userRole: UserRole;
}

export function PasswordCard({ userRole }: PasswordCardProps) {
  const { values, setters, status, isPending, filled, submit } =
    usePasswordChange(userRole);

  return (
    <div className={card}>
      <span className={cardTitle}>Password</span>
      <div className={fieldGrid}>
        <Field label="Current">
          <Input
            type="password"
            value={values.password}
            onChange={(e) => setters.setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={isPending}
          />
        </Field>
        <Field label="New">
          <Input
            type="password"
            value={values.newPassword}
            onChange={(e) => setters.setNewPassword(e.target.value)}
            autoComplete="new-password"
            disabled={isPending}
            placeholder="At least 6 characters"
          />
        </Field>
        <Field label="Confirm new">
          <Input
            type="password"
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
