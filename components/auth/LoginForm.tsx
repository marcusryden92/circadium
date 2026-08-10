"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { LoginSchema } from "@/schemas";
import { Button } from "@/components/ui";
import { login } from "@/actions/login";
import { AuthCard } from "./AuthCard";
import {
  form as formStyle,
  field,
  label,
  input,
  codeInput,
  fieldError,
  forgotRow,
  forgotLink,
  alertError,
  alertSuccess,
  submit,
} from "./AuthForm.css";

export const LoginForm = () => {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const urlError =
    searchParams.get("error") === "OAuthAccountNotLinked"
      ? "Email already in use with different provider"
      : "";

  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [error, setError] = useState<string | undefined>("");
  const [success, setSuccess] = useState<string | undefined>("");
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof LoginSchema>>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "", code: "" },
  });

  const onSubmit = (values: z.infer<typeof LoginSchema>) => {
    setError("");
    setSuccess("");
    startTransition(() => {
      login(values, callbackUrl)
        .then((data) => {
          if (data?.error) {
            form.reset();
            setError(data.error);
          }
          if (data?.success) {
            form.reset();
            setSuccess(data.success);
          }
          if (data?.twoFactor) {
            setShowTwoFactor(true);
          }
        })
        .catch((err: unknown) => {
          // A successful signIn redirects by throwing NEXT_REDIRECT; the
          // router still navigates, so it must not surface as an error.
          if (
            (err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")
          ) {
            return;
          }
          setError("An unexpected error occurred.");
        });
    });
  };

  const errors = form.formState.errors;
  const displayError = error || urlError;

  return (
    <AuthCard
      title={showTwoFactor ? "two-factor" : "welcome back"}
      subtitle={
        showTwoFactor ? "code from your authenticator app" : undefined
      }
      showSocial={!showTwoFactor}
      altAction={
        showTwoFactor
          ? undefined
          : {
              prompt: "New here?",
              label: "Create an account",
              href: "/auth/register",
            }
      }
    >
      <form className={formStyle} onSubmit={form.handleSubmit(onSubmit)}>
        {showTwoFactor ? (
          <div className={field}>
            <label htmlFor="code" className={label}>
              Code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="______"
              className={codeInput}
              disabled={isPending}
              {...form.register("code")}
            />
            {errors.code && (
              <span className={fieldError}>{errors.code.message}</span>
            )}
          </div>
        ) : (
          <>
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
                placeholder="••••••••"
                className={input}
                disabled={isPending}
                autoComplete="current-password"
                {...form.register("password")}
              />
              {errors.password && (
                <span className={fieldError}>{errors.password.message}</span>
              )}
              <div className={forgotRow}>
                <Link href="/auth/reset" className={forgotLink}>
                  Forgot password?
                </Link>
              </div>
            </div>
          </>
        )}

        {displayError && (
          <div className={alertError} role="alert">
            <AlertTriangle size={14} strokeWidth={2.2} />
            <span>{displayError}</span>
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
          {showTwoFactor ? "Verify" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
};
