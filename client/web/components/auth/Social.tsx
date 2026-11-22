"use client";

import { space } from "@/lib/theme";
import { useState, type ReactNode } from "react";
import { FaApple } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui";
import {
  PROVIDER_NAMES,
  enabledSignInProviders,
  startOAuthSignIn,
  type SignInProvider,
} from "@/lib/session/oauthSignIn";
import { alertError } from "./AuthForm.css";

/** Microsoft's four-square mark, in its brand colors as its sign-in guidelines ask. */
function MicrosoftLogo() {
  return (
    <svg width={16} height={16} viewBox="0 0 21 21" aria-hidden="true">
      <rect x={1} y={1} width={9} height={9} fill="#f25022" />
      <rect x={11} y={1} width={9} height={9} fill="#7fba00" />
      <rect x={1} y={11} width={9} height={9} fill="#00a4ef" />
      <rect x={11} y={11} width={9} height={9} fill="#ffb900" />
    </svg>
  );
}

const ICONS: Record<SignInProvider, ReactNode> = {
  google: <FcGoogle size={18} />,
  microsoft: <MicrosoftLogo />,
  apple: <FaApple size={18} />,
};

export const Social = () => {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const providers = enabledSignInProviders();
  // Stays set once the browser is leaving for the provider.
  const [starting, setStarting] = useState<SignInProvider>();
  const [error, setError] = useState<string>();

  const onClick = async (provider: SignInProvider) => {
    setError(undefined);
    setStarting(provider);
    try {
      await startOAuthSignIn(provider, callbackUrl);
    } catch {
      setStarting(undefined);
      setError(
        `${PROVIDER_NAMES[provider]} sign-in could not start in this browser. Sign in with your email instead.`,
      );
    }
  };

  if (providers.length === 0) return null;

  // One row of logo-only buttons: three "Continue with ..." labels do not fit
  // side by side, and Apple allows a custom button only its fixed titles or
  // the bare logo. The full name stays on each button for screen readers and
  // as a hover tooltip.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space["1.5"] }}>
      <div style={{ display: "flex", gap: space["1.5"] }}>
        {providers.map((provider) => (
          <Button
            key={provider}
            variant="glass"
            size="md"
            onClick={() => onClick(provider)}
            disabled={starting !== undefined}
            aria-label={`Continue with ${PROVIDER_NAMES[provider]}`}
            title={`Continue with ${PROVIDER_NAMES[provider]}`}
            style={{ flex: "1 1 0", justifyContent: "center" }}
          >
            {ICONS[provider]}
          </Button>
        ))}
      </div>
      {error && (
        <div className={alertError} role="alert">
          <AlertTriangle size={14} strokeWidth={2.2} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
