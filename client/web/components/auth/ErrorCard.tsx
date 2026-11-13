"use client";

import { TriangleAlert } from "lucide-react";
import { space, vars } from "@/lib/theme";
import { AuthCard } from "./AuthCard";

export const ErrorCard = () => {
  return (
    <AuthCard
      title="something went wrong"
      subtitle="we couldn't complete that request"
      altAction={{
        prompt: "Want to try again?",
        label: "Back to sign in",
        href: "/auth/login",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: space["2.5"],
          padding: "10px 0 4px",
          color: vars.status.error,
        }}
      >
        <TriangleAlert size={36} strokeWidth={1.8} />
      </div>
    </AuthCard>
  );
};
