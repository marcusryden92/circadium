"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { MIN_PASSWORD_LENGTH, RegisterSchema } from "@/schemas";
import { Button, PasswordInput, PasswordStrength } from "@/components/ui";
import { register } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
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
import { SPAM_HINT } from "./spamHint";

export const RegisterForm = () => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

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
    setError(undefined);
    setSuccess(undefined);
    startTransition(async () => {
      try {
        await register({
          name: values.name,
          email: values.email,
          password: values.password,
        });
        form.reset();
        // Worded to fit both cases Java cannot tell apart here: a new account
        // gets a confirmation link, a taken address gets a notice instead.
        setSuccess(
          `We sent an email to ${values.email}. Open the link in it to finish signing up. ${SPAM_HINT}`,
        );
      } catch (err) {
        setError(describeApiError(err));
      }
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
          <PasswordInput
            id="password"
            variant="boxed"
            placeholder={`at least ${MIN_PASSWORD_LENGTH} characters`}
            disabled={isPending}
            autoComplete="new-password"
            {...form.register("password")}
          />
          <PasswordStrength
            password={form.watch("password")}
            userInputs={[form.watch("email"), form.watch("name")]}
          />
          {errors.password && (
            <span className={fieldError}>{errors.password.message}</span>
          )}
        </div>

        <div className={field}>
          <label htmlFor="passwordConfirmation" className={label}>
            Confirm
          </label>
          <PasswordInput
            id="passwordConfirmation"
            variant="boxed"
            placeholder="retype"
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
