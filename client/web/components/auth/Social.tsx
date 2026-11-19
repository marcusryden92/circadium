"use client";

import { space } from "@/lib/theme";
import { FcGoogle } from "react-icons/fc";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui";
import { DEFAULT_LOGIN_REDIRECT } from "@/routes";

export const Social = () => {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");

  const onClick = (provider: "google") => {
    signIn(provider, {
      callbackUrl: callbackUrl || DEFAULT_LOGIN_REDIRECT,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space["1.5"] }}>
      <Button
        variant="glass"
        size="md"
        onClick={() => onClick("google")}
        style={{ justifyContent: "flex-start", width: "100%" }}
      >
        <FcGoogle size={16} />
        Continue with Google
      </Button>
    </div>
  );
};
