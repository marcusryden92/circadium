"use client";

import posthog from "posthog-js";
import { useSession } from "next-auth/react";
import { ReactNode, useEffect, useRef } from "react";

export default function PostHogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { data: session, status } = useSession();
  const wasAuthenticated = useRef(false);

  const userId = session?.user?.id;
  const email = session?.user?.email;
  const name = session?.user?.name;

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (status === "authenticated" && userId) {
      posthog.identify(userId, {
        email: email ?? undefined,
        name: name ?? undefined,
      });
      wasAuthenticated.current = true;
    } else if (status === "unauthenticated" && wasAuthenticated.current) {
      posthog.reset();
      wasAuthenticated.current = false;
    }
  }, [status, userId, email, name]);

  return <>{children}</>;
}
