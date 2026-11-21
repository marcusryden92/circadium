"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import { hardNavigate, reloadPage } from "@/lib/session/navigation";
import { onSessionEnded, startSessionKeeper } from "@/lib/session/refresh";
import type { Session } from "@/lib/session/session";

export type SessionState = {
  data: Session | null;
  status: "authenticated" | "unauthenticated";
};

const SessionContext = createContext<SessionState>({
  data: null,
  status: "unauthenticated",
});

/** Where a tab whose session ended goes, so signing in returns it here. */
export function loginUrlFor(location: {
  pathname: string;
  search: string;
}): string {
  const callbackUrl = `${location.pathname}${location.search}`;
  return `/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

/**
 * Holds the session the server rendered this page with (there is no loading
 * state: the server always knows) and keeps it alive while the page is open.
 * `router.refresh()` re-renders the layout and passes a new `session` in.
 */
export function SessionProvider({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  const userId = session?.user.id;
  const accessTokenExpiresAt = session?.accessTokenExpiresAt;

  useEffect(() => {
    if (!userId || !accessTokenExpiresAt) return;
    const unsubscribe = onSessionEnded((reason) => {
      if (reason === "user-changed") reloadPage();
      else hardNavigate(loginUrlFor(window.location));
    });
    const stop = startSessionKeeper({
      userId,
      accessTokenExpiresAt: Date.parse(accessTokenExpiresAt),
    });
    return () => {
      stop();
      unsubscribe();
    };
  }, [userId, accessTokenExpiresAt]);

  const value = useMemo<SessionState>(
    () => ({
      data: session,
      status: session ? "authenticated" : "unauthenticated",
    }),
    [session],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/** Same shape as NextAuth's `useSession`, minus the loading state. */
export function useSession(): SessionState {
  return useContext(SessionContext);
}
