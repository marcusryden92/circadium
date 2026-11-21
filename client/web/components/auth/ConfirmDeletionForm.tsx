"use client";

import { space } from "@/lib/theme";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { confirmAccountDeletion } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/errorMessage";
import { hardNavigate } from "@/lib/session/navigation";
import { forgetSession } from "@/lib/session/refresh";
import { loginUrlFor, useSession } from "@/lib/session/SessionProvider";
import { signOut } from "@/lib/session/signOut";
import { AuthCard } from "./AuthCard";
import { alertError, alertSuccess, forgotLink } from "./AuthForm.css";

const SIGN_IN_FIRST =
  "Sign in with the account you want to delete, then come back to this link.";

export function ConfirmDeletionForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { status: sessionStatus } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  const handleConfirm = () => {
    if (!token) return;
    setError(undefined);
    startTransition(async () => {
      try {
        await confirmAccountDeletion(token);
      } catch (err) {
        setError(
          err instanceof ApiError && err.status === 401
            ? SIGN_IN_FIRST
            : describeApiError(err),
        );
        return;
      }
      setDone(true);
      try {
        // Java has already ended the sessions with the account; this clears
        // the cookies and tells the other tabs.
        await signOut({ redirectTo: "/" });
      } catch {
        // The cookies are dead weight now: the access token names a user that
        // no longer exists and the refresh token's session row is gone.
        forgetSession();
        hardNavigate("/");
      }
    });
  };

  return (
    <AuthCard
      title="delete account"
      subtitle="this action cannot be reversed"
      altAction={
        done
          ? undefined
          : {
              prompt: "Changed your mind?",
              label: "Back to dashboard",
              href: "/dashboard",
            }
      }
    >
      {!token && (
        <div className={alertError} role="alert">
          <AlertTriangle size={14} strokeWidth={2.2} />
          <span>
            This link is missing its token. Open the link from the email again.
          </span>
        </div>
      )}

      {token && sessionStatus === "unauthenticated" && (
        <div style={{ display: "flex", flexDirection: "column", gap: space["2"] }}>
          <div className={alertError} role="alert">
            <AlertTriangle size={14} strokeWidth={2.2} />
            <span>{SIGN_IN_FIRST}</span>
          </div>
          <Link
            href={loginUrlFor({
              pathname: "/auth/confirm-deletion",
              search: `?token=${encodeURIComponent(token)}`,
            })}
            className={forgotLink}
          >
            Sign in
          </Link>
        </div>
      )}

      {token && sessionStatus === "authenticated" && !done && (
        <div style={{ display: "flex", flexDirection: "column", gap: space["3"] }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            Clicking below permanently deletes your account and every planner,
            category, location, template, and calendar event tied to it. There
            is no undo.
          </p>
          {error && (
            <div className={alertError} role="alert">
              <AlertTriangle size={14} strokeWidth={2.2} />
              <span>{error}</span>
            </div>
          )}
          <Button
            variant="danger"
            size="md"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? "Deleting…" : "Delete my account"}
          </Button>
        </div>
      )}

      {done && (
        <div className={alertSuccess} role="status">
          <CheckCircle2 size={14} strokeWidth={2.2} />
          <span>Account deleted. Signing you out…</span>
        </div>
      )}
    </AuthCard>
  );
}
