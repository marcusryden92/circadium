"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { MIN_PASSWORD_LENGTH, NewPasswordSchema } from "@/schemas";
import { Button, PasswordInput, PasswordStrength } from "@/components/ui";
import { resetPassword } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
import { AuthCard } from "./AuthCard";
import {
  form as formStyle,
  field,
  label,
  fieldError,
  alertError,
  alertSuccess,
  submit,
} from "./AuthForm.css";

export function NewPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const form = useForm<z.infer<typeof NewPasswordSchema>>({
    resolver: zodResolver(NewPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = (values: z.infer<typeof NewPasswordSchema>) => {
    setError(undefined);
    setSuccess(undefined);
    if (!token) {
      setError("This link is missing its token. Open the link from the email again.");
      return;
    }
    startTransition(async () => {
      try {
        await resetPassword({ token, password: values.password });
        form.reset();
        setSuccess(
          "Password updated, and every device was signed out. Sign in with the new password.",
        );
      } catch (err) {
        setError(describeApiError(err));
      }
    });
  };

  const errors = form.formState.errors;

  return (
    <AuthCard
      title="set new password"
      subtitle="choose something memorable"
      altAction={{
        prompt: success ? "Ready?" : "Remembered it?",
        label: "Back to sign in",
        href: "/auth/login",
      }}
    >
      <form className={formStyle} onSubmit={form.handleSubmit(onSubmit)}>
        <div className={field}>
          <label htmlFor="password" className={label}>
            New password
          </label>
          <PasswordInput
            id="password"
            variant="boxed"
            placeholder={`at least ${MIN_PASSWORD_LENGTH} characters`}
            disabled={isPending || !!success}
            autoComplete="new-password"
            {...form.register("password")}
          />
          {!success && <PasswordStrength password={form.watch("password")} />}
          {errors.password && (
            <span className={fieldError}>{errors.password.message}</span>
          )}
        </div>

        <div className={field}>
          <label htmlFor="confirmPassword" className={label}>
            Confirm
          </label>
          <PasswordInput
            id="confirmPassword"
            variant="boxed"
            placeholder="retype"
            disabled={isPending || !!success}
            autoComplete="new-password"
            {...form.register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <span className={fieldError}>{errors.confirmPassword.message}</span>
          )}
        </div>

        {error && (
          <div className={alertError} role="alert">
            <AlertTriangle size={14} strokeWidth={2.2} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className={alertSuccess} role="status">
            <CheckCircle2 size={14} strokeWidth={2.2} />
            <span>{success}</span>
          </div>
        )}

        <Button
          type="submit"
          variant="solid"
          size="lg"
          disabled={isPending || !!success}
          className={submit}
        >
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
