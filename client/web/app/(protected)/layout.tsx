import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { retry } from "@/lib/retry";
import type { Session } from "@/lib/session/session";
import type { AiMode } from "@/generated/client";
import { ProtectedProviders } from "./ProtectedProviders";

// Server component: resolve whether the user still needs first-run setup before
// the first paint, so the onboarding overlay renders in its correct state
// immediately instead of popping in after a client round-trip. The AI mode
// rides the same query so every AI entry point gates without a client
// round-trip either.
export default async function CircadiumLayout({
  children,
}: {
  children: ReactNode;
}) {
  // undefined: the session could not be checked (database or Java keys
  // unreachable). The app then renders without account data, and every server
  // action fails closed on its own auth() call.
  let session: Session | null | undefined;
  try {
    session = await auth();
  } catch {
    session = undefined;
  }
  // The middleware already turned away requests without a valid token; this
  // catches the tokens only the database can refuse (account deleted, issued
  // before the last password change).
  if (session === null) redirect("/auth/login");

  let needsOnboarding = false;
  let aiMode: AiMode | null = null;
  let aiModel: string | null = null;
  try {
    if (session) {
      const userId = session.user.id;
      const user = await retry(() =>
        db.user.findUnique({
          where: { id: userId },
          select: { onboardedAt: true, aiMode: true, aiModel: true },
        }),
      );
      needsOnboarding = user?.onboardedAt == null;
      aiMode = user?.aiMode ?? null;
      aiModel = user?.aiModel ?? null;
    }
  } catch {
    // If the session/DB check fails, don't trap the user in setup — fall
    // through to the app; every onboarding surface is reachable individually.
    needsOnboarding = false;
  }

  return (
    <ProtectedProviders
      needsOnboarding={needsOnboarding}
      aiMode={aiMode}
      aiModel={aiModel}
    >
      {children}
    </ProtectedProviders>
  );
}
