"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { verifyEmail } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
import { Loader } from "@/components/ui";
import { AuthCard } from "./AuthCard";
import { alertError, alertSuccess } from "./AuthForm.css";

export function NewVerificationForm() {
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  // The token works once. React runs effects twice in development, and a
  // second request would turn a success into "already used".
  const sent = useRef(false);

  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setError("This link is missing its token. Open the link from the email again.");
      return;
    }
    verifyEmail(token)
      .then(() => setSuccess("Your email address is confirmed."))
      .catch((err: unknown) => setError(describeApiError(err)));
  }, [token]);

  const isPending = !success && !error;

  return (
    <AuthCard
      title="verifying"
      subtitle="confirming your email address"
      altAction={{
        prompt: "Done?",
        label: "Back to sign in",
        href: "/auth/login",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "8px 0",
        }}
      >
        {isPending && <Loader size="md" label="Verifying" />}
        {success && (
          <div className={alertSuccess} role="status">
            <CheckCircle2 size={14} strokeWidth={2.2} />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className={alertError} role="alert">
            <AlertTriangle size={14} strokeWidth={2.2} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </AuthCard>
  );
}
