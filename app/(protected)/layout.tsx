import { type ReactNode } from "react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { retry } from "@/lib/retry";
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
  let needsOnboarding = false;
  let aiMode: AiMode | null = null;
  try {
    const session = await auth();
    if (session?.user?.id) {
      const user = await retry(() =>
        db.user.findUnique({
          where: { id: session.user.id },
          select: { onboardedAt: true, aiMode: true },
        }),
      );
      needsOnboarding = user?.onboardedAt == null;
      aiMode = user?.aiMode ?? null;
    }
  } catch {
    // If the session/DB check fails, don't trap the user in setup — fall
    // through to the app; every onboarding surface is reachable individually.
    needsOnboarding = false;
  }

  return (
    <ProtectedProviders needsOnboarding={needsOnboarding} aiMode={aiMode}>
      {children}
    </ProtectedProviders>
  );
}
