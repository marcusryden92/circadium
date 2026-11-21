"use client";

import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

interface UseLocationModalStateArgs {
  open: boolean;
  // Re-run reset when this changes (e.g. the modal's target location changes
  // while it stays open). Pass a stable identity (id, or null) to keep it
  // simple.
  resetKey?: string | null;
}

interface UseLocationModalStateResult {
  sessionToken: string | null;
  resetSignal: number;
}

// On every modal open (and whenever resetKey shifts), mints a fresh Google
// Places session token and emits a `resetSignal` callers can hang their own
// form-reset effects off of. The token rides every autocomplete request and is
// redeemed by the Place Details call at save, closing the billing session.
export function useLocationModalState({
  open,
  resetKey = null,
}: UseLocationModalStateArgs): UseLocationModalStateResult {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSessionToken(uuidv4());
    setResetSignal((n) => n + 1);
  }, [open, resetKey]);

  return { sessionToken, resetSignal };
}
