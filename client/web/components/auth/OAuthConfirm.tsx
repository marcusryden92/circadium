"use client";

import { space } from "@/lib/theme";
import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui";
import { confirmOAuthSignup } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
import {
  PROVIDER_NAMES,
  isSignInProvider,
  startOAuthSignIn,
  type SignInProvider,
} from "@/lib/session/oauthSignIn";
import { AuthCard } from "./AuthCard";
import { alertError, alertSuccess } from "./AuthForm.css";

const MISSING_TOKEN =
  "This link is missing its token. Open the link from the email again.";

/**
 * Where the link mailed after a first Microsoft sign-in lands. Nothing happens
 * until the button is pressed: mail scanners open links, and opening this one
 * creates an account. Even then nobody is signed in; the account becomes usable
 * by signing in with the provider again.
 */
export function OAuthConfirm() {
  const token = useSearchParams().get("token");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(
    token ? undefined : MISSING_TOKEN,
  );
  const [provider, setProvider] = useState<SignInProvider>();
  const [starting, setStarting] = useState(false);

  const confirm = () => {
    if (!token) return;
    setError(undefined);
    startTransition(async () => {
      try {
        const confirmed = await confirmOAuthSignup(token);
        if (!isSignInProvider(confirmed.provider)) {
          throw new Error("Unexpected sign-up response.");
        }
        setProvider(confirmed.provider);
      } catch (err) {
        setError(describeApiError(err));
      }
    });
  };

  const signIn = async () => {
    if (!provider) return;
    setStarting(true);
    try {
      await startOAuthSignIn(provider, null);
    } catch {
      setStarting(false);
      setError(
        `${PROVIDER_NAMES[provider]} sign-in could not start in this browser. Try another browser.`,
      );
    }
  };

  return (
    <AuthCard
      title={provider ? "account ready" : "confirm sign-up"}
      subtitle={
        provider
          ? `sign in with ${PROVIDER_NAMES[provider]} to start`
          : "create your Circadium account"
      }
      altAction={{
        prompt: "Not you?",
        label: "Back to sign in",
        href: "/auth/login",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: space["2"] }}>
        {!provider && (
          <p style={{ margin: 0 }}>
            Confirm that this email address is yours to create a Circadium
            account that signs in with the provider you just used.
          </p>
        )}
        {provider && (
          <div className={alertSuccess} role="status">
            <CheckCircle2 size={14} strokeWidth={2.2} />
            <span>
              Your email address is confirmed and your account is ready. Sign in
              with {PROVIDER_NAMES[provider]} again to start.
            </span>
          </div>
        )}
        {error && (
          <div className={alertError} role="alert">
            <AlertTriangle size={14} strokeWidth={2.2} />
            <span>{error}</span>
          </div>
        )}
        {provider ? (
          <Button
            variant="solid"
            size="md"
            onClick={signIn}
            disabled={starting}
            style={{ width: "100%" }}
          >
            Continue with {PROVIDER_NAMES[provider]}
          </Button>
        ) : (
          token && (
            <Button
              variant="solid"
              size="md"
              onClick={confirm}
              disabled={isPending}
              style={{ width: "100%" }}
            >
              Create account
            </Button>
          )
        )}
      </div>
    </AuthCard>
  );
}
