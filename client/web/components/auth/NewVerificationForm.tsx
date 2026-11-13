"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { newVerification } from "@/actions/newVerificationAction";
import { Loader } from "@/components/ui";
import { AuthCard } from "./AuthCard";
import { alertError, alertSuccess } from "./AuthForm.css";

export function NewVerificationForm() {
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();

  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const onSubmit = useCallback(() => {
    if (!token) {
      setError("Missing token");
      return;
    }

    newVerification(token)
      .then((data) => {
        setSuccess(data.success);
        setError(data.error);
      })
      .catch(() => setError("Something went wrong!"));
  }, [token]);

  useEffect(() => {
    onSubmit();
  }, [onSubmit]);

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
