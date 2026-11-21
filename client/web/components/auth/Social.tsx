"use client";

import { space } from "@/lib/theme";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui";
import { startGoogleSignIn } from "@/lib/session/googleSignIn";
import { alertError } from "./AuthForm.css";

export const Social = () => {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  // Stays set once the browser is leaving for Google.
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  const onClick = async () => {
    setError(undefined);
    setStarting(true);
    try {
      await startGoogleSignIn(callbackUrl);
    } catch {
      setStarting(false);
      setError(
        "Google sign-in could not start in this browser. Sign in with your email instead.",
      );
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space["1.5"] }}>
      <Button
        variant="glass"
        size="md"
        onClick={onClick}
        disabled={starting}
        style={{ justifyContent: "flex-start", width: "100%" }}
      >
        <FcGoogle size={16} />
        Continue with Google
      </Button>
      {error && (
        <div className={alertError} role="alert">
          <AlertTriangle size={14} strokeWidth={2.2} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
