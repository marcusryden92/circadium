"use client";

import { space } from "@/lib/theme";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui";
import { confirmAccountDeletion } from "@/actions/deleteAccount";
import { useServerAction } from "@/hooks/useServerAction";
import { AuthCard } from "./AuthCard";
import { alertError, alertSuccess } from "./AuthForm.css";

export function ConfirmDeletionForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { status: sessionStatus } = useSession();
  const { run, isPending } = useServerAction(confirmAccountDeletion);
  const [message, setMessage] = useState<
    { tone: "error" | "success"; text: string } | null
  >(null);
  const [done, setDone] = useState(false);

  const handleConfirm = async () => {
    if (!token) {
      setMessage({ tone: "error", text: "Missing token." });
      return;
    }
    setMessage(null);
    const result = await run(token);
    if (!result) return;
    if (result.error) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setDone(true);
    // Session is now bound to a user row that no longer exists — end it and
    // send them home.
    await signOut({ callbackUrl: "/" });
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
          <span>Missing confirmation token.</span>
        </div>
      )}

      {token && sessionStatus === "unauthenticated" && (
        <div className={alertError} role="alert">
          <AlertTriangle size={14} strokeWidth={2.2} />
          <span>
            Sign in with the account you want to delete, then reopen this link.
          </span>
        </div>
      )}

      {token && sessionStatus === "authenticated" && !done && (
        <div style={{ display: "flex", flexDirection: "column", gap: space["3"] }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            Clicking below permanently deletes your account and every planner,
            category, location, template, and calendar event tied to it. There
            is no undo.
          </p>
          {message && message.tone === "error" && (
            <div className={alertError} role="alert">
              <AlertTriangle size={14} strokeWidth={2.2} />
              <span>{message.text}</span>
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
