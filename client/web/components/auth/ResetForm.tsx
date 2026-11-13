"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { ResetSchema } from "@/schemas";
import { Button } from "@/components/ui";
import { reset } from "@/actions/reset";
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

interface ResetResponse {
  error?: string;
  success?: string;
}

export function ResetForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>("");
  const [success, setSuccess] = useState<string | undefined>("");

  const form = useForm<z.infer<typeof ResetSchema>>({
    resolver: zodResolver(ResetSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: z.infer<typeof ResetSchema>) => {
    setError("");
    setSuccess("");
    startTransition(() => {
      reset(values).then((data: ResetResponse) => {
        setError(data?.error);
        setSuccess(data?.success);
      });
    });
  };

  const errors = form.formState.errors;

  return (
    <AuthCard
      title="reset password"
      subtitle="we'll email you a link to set a new password"
      altAction={{
        prompt: "Remembered it?",
        label: "Back to sign in",
        href: "/auth/login",
      }}
    >
      <form className={formStyle} onSubmit={form.handleSubmit(onSubmit)}>
        <div className={field}>
          <label htmlFor="email" className={label}>
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@email.com"
            className={input}
            disabled={isPending}
            autoComplete="email"
            {...form.register("email")}
          />
          {errors.email && (
            <span className={fieldError}>{errors.email.message}</span>
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
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
