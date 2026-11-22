"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { LoginSchema, TwoFactorCodeSchema } from "@/schemas";
import { Button, PasswordInput } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  signInWithPassword,
  verifyTwoFactorCode,
  type SignInOutcome,
} from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
import { safeCallbackUrl } from "@/lib/session/callbackUrl";
import { hardNavigate } from "@/lib/session/navigation";
import { hasRememberedSession, refreshSession } from "@/lib/session/refresh";
import { useSession } from "@/lib/session/SessionProvider";
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
  linkButton,
  alertError,
  alertSuccess,
  submit,
} from "./AuthForm.css";
import { SPAM_HINT } from "./spamHint";

type LoginValues = z.infer<typeof LoginSchema>;
type Step = "password" | "code";

const CODE_SENT = `We emailed you a 6-digit code. It expires in 5 minutes. ${SPAM_HINT}`;
const RESUMING = "Signing you back in...";

export const LoginForm = () => {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const { status: sessionStatus } = useSession();

  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [isPending, startTransition] = useTransition();
  // Stays set while the browser loads the next page, so the form cannot be
  // sent twice (each send would start another session).
  const [leaving, setLeaving] = useState(false);
  const [resuming, setResuming] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "", code: "" },
  });

  const leave = () => {
    setLeaving(true);
    // A full page load: the server renders the new session, and nothing held
    // in memory from before the sign-in carries over.
    hardNavigate(safeCallbackUrl(callbackUrl, window.location.origin));
  };

  // A visitor may already be signed in. The common case is an access cookie
  // that expired while no tab was open: the refresh cookie is still good, but
  // it only ever goes to the API, so only this page can trade it for a new
  // access cookie. A browser that holds no session skips the attempt. Both
  // dependencies are fixed for the life of the page, so this runs once.
  useEffect(() => {
    const signedIn = sessionStatus === "authenticated";
    if (!signedIn && !hasRememberedSession()) return;
    let active = true;
    setResuming(true);
    const resumed = signedIn
      ? Promise.resolve(true)
      : refreshSession().then((outcome) => outcome === "refreshed");
    void resumed.then((ok) => {
      if (!active) return;
      if (ok) {
        setLeaving(true);
        hardNavigate(safeCallbackUrl(callbackUrl, window.location.origin));
      } else {
        setResuming(false);
      }
    });
    return () => {
      active = false;
    };
  }, [sessionStatus, callbackUrl]);

  const follow = (outcome: SignInOutcome) => {
    if (outcome === "signed-in") {
      leave();
    } else if (outcome === "two-factor-required") {
      setStep("code");
      form.setValue("code", "");
      setNotice(CODE_SENT);
    } else {
      setStep("password");
      form.resetField("password");
      setNotice(`Confirm your email first: we sent you a new link. ${SPAM_HINT}`);
    }
  };

  const describe = (err: unknown, currentStep: Step) => {
    if (err instanceof ApiError && err.status === 401) {
      return currentStep === "code"
        ? "That code is wrong or has expired."
        : "Invalid email or password.";
    }
    return describeApiError(err);
  };

  const send = (values: LoginValues, currentStep: Step) => {
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      try {
        const credentials = { email: values.email, password: values.password };
        const outcome =
          currentStep === "code"
            ? await verifyTwoFactorCode({ ...credentials, code: values.code ?? "" })
            : await signInWithPassword(credentials);
        follow(outcome);
      } catch (err) {
        setError(describe(err, currentStep));
        // The 2FA step sends the password again, so on that screen (a wrong
        // code, or a failed resend) the password must survive.
        form.resetField(step === "code" ? "code" : "password");
      }
    });
  };

  const onSubmit = (values: LoginValues) => {
    if (step === "code") {
      const code = TwoFactorCodeSchema.safeParse(values.code ?? "");
      if (!code.success) {
        form.setError("code", { message: code.error.issues[0]?.message });
        return;
      }
      send({ ...values, code: code.data }, "code");
      return;
    }
    send(values, "password");
  };

  // Signing in again is what emails a fresh code.
  const resendCode = () => send(form.getValues(), "password");

  const errors = form.formState.errors;
  const busy = isPending || leaving || resuming;
  const status = resuming ? RESUMING : notice;

  return (
    <AuthCard
      title={step === "code" ? "two-factor" : "welcome back"}
      subtitle={step === "code" ? "enter the code we emailed you" : undefined}
      showSocial={step === "password"}
      altAction={
        step === "code"
          ? undefined
          : {
              prompt: "New here?",
              label: "Create an account",
              href: "/auth/register",
            }
      }
    >
      <form className={formStyle} onSubmit={form.handleSubmit(onSubmit)}>
        {step === "code" ? (
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
              disabled={busy}
              {...form.register("code")}
            />
            {errors.code && (
              <span className={fieldError}>{errors.code.message}</span>
            )}
            <div className={forgotRow}>
              <button
                type="button"
                className={linkButton}
                onClick={resendCode}
                disabled={busy}
              >
                Send a new code
              </button>
            </div>
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
                disabled={busy}
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
                placeholder="••••••••"
                disabled={busy}
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

        {error && (
          <div className={alertError} role="alert">
            <AlertTriangle size={14} strokeWidth={2.2} />
            <span>{error}</span>
          </div>
        )}
        {status && (
          <div className={alertSuccess} role="status">
            <CheckCircle2 size={14} strokeWidth={2.2} />
            <span>{status}</span>
          </div>
        )}

        <Button
          type="submit"
          variant="solid"
          size="lg"
          disabled={busy}
          className={submit}
        >
          {step === "code" ? "Verify" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
};
