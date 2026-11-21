"use client";

import posthog from "posthog-js";
import { ReactNode, useEffect } from "react";

import { useSession } from "@/lib/session/SessionProvider";

export default function PostHogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { data: session } = useSession();

  const userId = session?.user.id;
  const email = session?.user.email;
  const name = session?.user.name;

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (userId) {
      posthog.identify(userId, {
        email: email ?? undefined,
        name: name ?? undefined,
      });
    } else if (posthog.get_property("$user_state") === "identified") {
      // A session always ends with a page load, so the signed-out state shows
      // up here as a fresh page whose stored identity is still the previous
      // user's. Without the reset, anonymous events would go to that person.
      posthog.reset();
    }
  }, [userId, email, name]);

  return <>{children}</>;
}
