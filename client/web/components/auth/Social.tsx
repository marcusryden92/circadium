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
    <svg width={14} height={14} viewBox="0 0 21 21" aria-hidden="true">
      <rect x={1} y={1} width={9} height={9} fill="#f25022" />
      <rect x={11} y={1} width={9} height={9} fill="#7fba00" />
      <rect x={1} y={11} width={9} height={9} fill="#00a4ef" />
      <rect x={11} y={11} width={9} height={9} fill="#ffb900" />
    </svg>
  );
}

const ICONS: Record<SignInProvider, ReactNode> = {
  google: <FcGoogle size={16} />,
  microsoft: <MicrosoftLogo />,
  apple: <FaApple size={16} />,
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space["1.5"] }}>
      {providers.map((provider) => (
        <Button
          key={provider}
          variant="glass"
          size="md"
          onClick={() => onClick(provider)}
          disabled={starting !== undefined}
          style={{ justifyContent: "flex-start", width: "100%" }}
        >
          {ICONS[provider]}
          Continue with {PROVIDER_NAMES[provider]}
        </Button>
      ))}
      {error && (
        <div className={alertError} role="alert">
          <AlertTriangle size={14} strokeWidth={2.2} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
