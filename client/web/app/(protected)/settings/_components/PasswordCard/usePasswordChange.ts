"use client";

import { useState } from "react";
import { PasswordChangeSchema } from "@/schemas";
import { changePassword } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
import { useServerAction } from "@/hooks/useServerAction";

const CHANGED = "Password changed. Other browsers and devices were signed out.";

async function submitPasswordChange(values: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success?: string; error?: string }> {
  try {
    await changePassword(values);
    return { success: CHANGED };
  } catch (error) {
    return { error: describeApiError(error) };
  }
}

export function usePasswordChange() {
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const { run, status, isPending, setSuccess, setError, clear } =
    useServerAction(submitPasswordChange);

  const filled =
    password.length > 0 &&
    newPassword.length > 0 &&
    confirmNewPassword.length > 0;

  const reset = () => {
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  const submit = async () => {
    clear();
    const parsed = PasswordChangeSchema.safeParse({
      currentPassword: password,
      newPassword,
      confirmNewPassword,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(
        issue?.path[0] === "newPassword"
          ? `New password: ${issue.message}`
          : (issue?.message ?? "Check the passwords and try again."),
      );
      return;
    }
    const result = await run({
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    if (!result) return;
    if (result.error) {
      setError(result.error);
    } else if (result.success) {
      setSuccess(result.success);
      reset();
    }
  };

  return {
    values: { password, newPassword, confirmNewPassword },
    setters: {
      setPassword,
      setNewPassword,
      setConfirmNewPassword,
    },
    status,
    isPending,
    filled,
    submit,
    reset,
  };
}
