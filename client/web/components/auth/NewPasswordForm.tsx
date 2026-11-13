"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { NewPasswordSchema } from "@/schemas";
import { Button } from "@/components/ui";
import { newPassword } from "@/actions/newPassword";
import { AuthCard } from "./AuthCard";
import {
  form as formStyle,
  field,
  label,
  input,
  fieldError,
  alertError,
  alertSuccess,
  submit,
} from "./AuthForm.css";

interface NewPasswordResponse {
  error?: string;
  success?: string;
}

export function NewPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>("");
  const [success, setSuccess] = useState<string | undefined>("");

  const form = useForm<z.infer<typeof NewPasswordSchema>>({
    resolver: zodResolver(NewPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = (values: z.infer<typeof NewPasswordSchema>) => {
    setError("");
    setSuccess("");
    startTransition(() => {
      newPassword(values, token).then((data: NewPasswordResponse) => {
        setError(data?.error);
        setSuccess(data?.success);
      });
    });
  };

  const errors = form.formState.errors;

  return (
    <AuthCard
      title="set new password"
      subtitle="choose something memorable"
      altAction={{
        prompt: "Remembered it?",
        label: "Back to sign in",
        href: "/auth/login",
      }}
    >
      <form className={formStyle} onSubmit={form.handleSubmit(onSubmit)}>
        <div className={field}>
          <label htmlFor="password" className={label}>
            New password
          </label>
          <input
            id="password"
            type="password"
            placeholder="at least 6 chars"
            className={input}
            disabled={isPending}
            autoComplete="new-password"
            {...form.register("password")}
          />
          {errors.password && (
            <span className={fieldError}>{errors.password.message}</span>
          )}
        </div>

        <div className={field}>
          <label htmlFor="confirmPassword" className={label}>
            Confirm
          </label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="retype"
            className={input}
            disabled={isPending}
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
          disabled={isPending}
          className={submit}
        >
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
