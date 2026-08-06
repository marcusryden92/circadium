"use client";

import { type ReactNode } from "react";
import dynamic from "next/dynamic";
import StoreProvider from "@/context/StoreProvider";
import UserProvider from "@/context/UserProvider";
import CalendarProvider from "@/context/CalendarProvider";
import type { AiMode } from "@/generated/client";
import {
  AppShell,
  AssistantProvider,
  AiAccessProvider,
  ToastStack,
  SaveIndicator,
} from "@/components/ui";
import { AppLoadingScreen } from "@/components/ui/AppLoadingScreen";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { OnboardingOverlay } from "./onboarding/OnboardingOverlay";

// On-demand modal: lazy so react-markdown + draft views stay out of every route's compile.
const GlobalAssistant = dynamic(
  () =>
    import("@/components/draft/GlobalAssistant").then((m) => m.GlobalAssistant),
  { ssr: false },
);

export function ProtectedProviders({
  children,
  needsOnboarding,
  aiMode,
}: {
  children: ReactNode;
  needsOnboarding: boolean;
  aiMode: AiMode | null;
}) {
  return (
    <StoreProvider>
      <UserProvider>
        <CalendarProvider>
          <CircadiumShell needsOnboarding={needsOnboarding} aiMode={aiMode}>
            {children}
          </CircadiumShell>
        </CalendarProvider>
      </UserProvider>
    </StoreProvider>
  );
}

function CircadiumShell({
  children,
  needsOnboarding,
  aiMode,
}: {
  children: ReactNode;
  needsOnboarding: boolean;
  aiMode: AiMode | null;
}) {
  const user = useCurrentUser();
  const userName = user?.name ?? user?.email ?? "";
  const userInitial = userName.trim().charAt(0).toUpperCase() || "?";
  return (
    <AiAccessProvider initialMode={aiMode}>
      <AssistantProvider>
        <AppShell
          userName={userName}
          userInitial={userInitial}
          assistantSlot={<GlobalAssistant />}
          // First-run setup renders as an opaque overlay inside the shell canvas
          // (covers the sidebar, clips to the shell rounding). Its initial state
          // is resolved on the server, so there is no post-hydration flash.
          overlaySlot={
            <OnboardingOverlay initialNeedsOnboarding={needsOnboarding} />
          }
          loadingSlot={<AppLoadingScreen />}
        >
          {children}
          {/* Portal into the shell canvas from under ShellPortalProvider. */}
          <ToastStack />
          <SaveIndicator />
        </AppShell>
      </AssistantProvider>
    </AiAccessProvider>
  );
}
