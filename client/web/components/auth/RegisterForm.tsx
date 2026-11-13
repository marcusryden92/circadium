"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { RegisterSchema } from "@/schemas";
import { Button } from "@/components/ui";
import { register } from "@/actions/register";
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

export const RegisterForm = () => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>("");
  const [success, setSuccess] = useState<string | undefined>("");

  const form = useForm<z.infer<typeof RegisterSchema>>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      email: "",
      password: "",
      passwordConfirmation: "",
      name: "",
    },
  });

  const onSubmit = (values: z.infer<typeof RegisterSchema>) => {
    setError("");
    setSuccess("");
    startTransition(() => {
      register(values).then((data) => {
        setError(data.error);
        setSuccess(data.success);
      });
    });
  };

  const errors = form.formState.errors;

  return (
    <AuthCard
      title="create account"
      subtitle="takes 30 seconds"
      showSocial
      altAction={{
        prompt: "Have an account?",
        label: "Sign in",
        href: "/auth/login",
      }}
    >
      <form className={formStyle} onSubmit={form.handleSubmit(onSubmit)}>
        <div className={field}>
          <label htmlFor="name" className={label}>
            Name
          </label>
          <input
            id="name"
            type="text"
            placeholder="Your name"
            className={input}
            disabled={isPending}
            autoComplete="name"
            {...form.register("name")}
          />
          {errors.name && (
            <span className={fieldError}>{errors.name.message}</span>
          )}
        </div>

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

        <div className={field}>
          <label htmlFor="password" className={label}>
            Password
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
          <label htmlFor="passwordConfirmation" className={label}>
            Confirm
          </label>
          <input
            id="passwordConfirmation"
            type="password"
            placeholder="retype"
            className={input}
            disabled={isPending}
            autoComplete="new-password"
            {...form.register("passwordConfirmation")}
          />
          {errors.passwordConfirmation && (
            <span className={fieldError}>
              {errors.passwordConfirmation.message}
            </span>
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
          Create account
        </Button>
      </form>
    </AuthCard>
  );
};
