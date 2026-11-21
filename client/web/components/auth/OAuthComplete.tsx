"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Loader } from "@/components/ui";
import { redeemGoogleSignIn } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
import { safeCallbackUrl } from "@/lib/session/callbackUrl";
import { takePendingGoogleSignIn } from "@/lib/session/googleSignIn";
import { hardNavigate } from "@/lib/session/navigation";
import { AuthCard } from "./AuthCard";
import { alertError } from "./AuthForm.css";

/** The `error` values Java's sign-in handler can send back. */
const SIGN_IN_ERRORS: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  account_exists:
    "This email already has a Circadium account that signs in with a password. Sign in with your email and password instead.",
  email_unverified:
    "Google has not verified this email address, so it cannot be used to sign in.",
};
const SIGN_IN_FAILED = "Google sign-in did not work. Try again.";
const NOT_STARTED_HERE =
  "This sign-in was started in another tab or window. Start it again from here.";

/** Where Java sends the browser at the end of "Continue with Google". */
export function OAuthComplete() {
  const [error, setError] = useState<string>();
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
    // The code is a credential until it is redeemed: keep it out of the
    // history entry, where the back button or history sync would keep it.
    window.history.replaceState(window.history.state, "", window.location.pathname);

    const pending = takePendingGoogleSignIn();
    if (pending?.callbackUrl) {
      setRetryHref(
        `/auth/login?callbackUrl=${encodeURIComponent(pending.callbackUrl)}`,
      );
    }
    if (errorCode || !code) {
      setError(SIGN_IN_ERRORS[errorCode ?? ""] ?? SIGN_IN_FAILED);
      return;
    }
    if (!pending) {
      setError(NOT_STARTED_HERE);
      return;
    }
    redeemGoogleSignIn({ code, verifier: pending.verifier })
      .then(() =>
        hardNavigate(safeCallbackUrl(pending.callbackUrl, window.location.origin)),
      )
      .catch((err: unknown) => setError(describeApiError(err)));
  }, []);

  return (
    <AuthCard
      title={error ? "sign-in failed" : "signing you in"}
      altAction={
        error
          ? { prompt: "Try again?", label: "Back to sign in", href: retryHref }
          : undefined
      }
    >
      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
        {error ? (
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
