"use client";

import { useState } from "react";
import { settings } from "@/actions/settings";
import { useServerAction } from "@/hooks/useServerAction";
import type { UserRole } from "@/generated/client";

export function usePasswordChange(userRole: UserRole) {
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const { run, status, isPending, setSuccess, setError, clear } =
    useServerAction(settings);

  const filled =
    password.length > 0 &&
    newPassword.length > 0 &&
    confirmNewPassword.length > 0;
  const matches = newPassword === confirmNewPassword;

  const reset = () => {
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  const submit = async () => {
    clear();
    if (!matches) {
      setError("New passwords don't match.");
      return;
    }
    const result = await run({
      password,
      newPassword,
      confirmNewPassword,
      role: userRole,
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
