"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, MailCheck } from "lucide-react";

import { Loader } from "@/components/ui";
import { redeemOAuthSignIn } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
import { safeCallbackUrl } from "@/lib/session/callbackUrl";
import {
  PROVIDER_NAMES,
  takePendingOAuthSignIn,
  type SignInProvider,
} from "@/lib/session/oauthSignIn";
import { hardNavigate } from "@/lib/session/navigation";
import { AuthCard } from "./AuthCard";
import { alertError, alertSuccess } from "./AuthForm.css";

/** The `error` values Java's sign-in handler can send back. */
function signInError(code: string | null, provider: SignInProvider | undefined) {
  const name = provider ? PROVIDER_NAMES[provider] : undefined;
  switch (code) {
    case "access_denied":
      return `${name ?? "The"} sign-in was cancelled.`;
    case "account_exists":
      return "This email already has a Circadium account. Sign in the way you signed up: with your password, or with the account you used then.";
    case "email_missing":
      return `${name ?? "The provider"} did not share an email address, so it cannot be used to sign in.`;
    default:
      return `${name ?? "The"} sign-in did not work. Try again.`;
  }
}

const NOT_STARTED_HERE =
  "This sign-in was started in another tab or window. Start it again from here.";

/** Where Java sends the browser at the end of "Continue with ...". */
export function OAuthComplete() {
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [retryHref, setRetryHref] = useState("/auth/login");
  // The code works once. React runs effects twice in development, and the
  // second redemption would fail and show an error over a good sign-in.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorCode = params.get("error");
    const status = params.get("status");
    // The code is a credential until it is redeemed: keep it out of the
    // history entry, where the back button or history sync would keep it.
    window.history.replaceState(window.history.state, "", window.location.pathname);

    const pending = takePendingOAuthSignIn();
    if (pending?.callbackUrl) {
      setRetryHref(
        `/auth/login?callbackUrl=${encodeURIComponent(pending.callbackUrl)}`,
      );
    }
    if (status === "verification_sent") {
      const name = pending ? PROVIDER_NAMES[pending.provider] : "the provider";
      setNotice(
        `Check the inbox of the email address on your ${name} account: we sent it a link with the next step.`,
      );
      return;
    }
    if (errorCode || !code) {
      setError(signInError(errorCode, pending?.provider));
      return;
    }
    if (!pending) {
      setError(NOT_STARTED_HERE);
      return;
    }
    redeemOAuthSignIn({ code, verifier: pending.verifier })
      .then(() =>
        hardNavigate(safeCallbackUrl(pending.callbackUrl, window.location.origin)),
      )
      .catch((err: unknown) => setError(describeApiError(err)));
  }, []);

  const title = notice ? "check your email" : error ? "sign-in failed" : "signing you in";

  return (
    <AuthCard
      title={title}
      altAction={
        error || notice
          ? {
              prompt: notice ? "Done?" : "Try again?",
              label: "Back to sign in",
              href: retryHref,
            }
          : undefined
      }
    >
      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
        {notice ? (
          <div className={alertSuccess} role="status">
            <MailCheck size={14} strokeWidth={2.2} />
            <span>{notice}</span>
          </div>
        ) : error ? (
          <div className={alertError} role="alert">
            <AlertTriangle size={14} strokeWidth={2.2} />
            <span>{error}</span>
          </div>
        ) : (
          <Loader size="md" label="Signing in" />
        )}
      </div>
    </AuthCard>
  );
}
