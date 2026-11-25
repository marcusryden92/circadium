import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Session } from "@/lib/session/session";
import { ProtectedProviders } from "./ProtectedProviders";

// Server component: resolve whether the user still needs first-run setup before
// the first paint, so the onboarding overlay renders in its correct state
// immediately instead of popping in after a client round-trip. The AI mode
// rides the same session payload so every AI entry point gates without a
// client round-trip either.
export default async function CircadiumLayout({
  children,
}: {
  children: ReactNode;
}) {
  // undefined: the session could not be checked (Java unreachable). The app
  // then renders without account data, and every API call fails closed on the
  // Java side's own auth.
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

  // If the check failed, don't trap the user in setup — fall through to the
  // app; every onboarding surface is reachable individually.
  const needsOnboarding = session ? session.user.onboardedAt == null : false;
  const aiMode = session?.user.aiMode ?? null;
  const aiModel = session?.user.aiModel ?? null;

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
