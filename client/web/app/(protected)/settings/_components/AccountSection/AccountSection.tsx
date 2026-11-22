"use client";

import type { UserRole } from "@/generated/client";
import { EmailCard } from "../EmailCard";
import { PasswordCard } from "../PasswordCard";
import { TwoFactorCard } from "../TwoFactorCard";
import { ProvidersCard } from "../ProvidersCard";

interface AccountSectionProps {
  user: {
    email?: string;
    role: UserRole;
    isTwoFactorEnabled: boolean;
    isOAuth?: boolean;
    signInProviders?: string[];
  };
}

export function AccountSection({ user }: AccountSectionProps) {
  return (
    <>
      <EmailCard user={user} />
      {!user.isOAuth && <PasswordCard email={user.email} />}
      {!user.isOAuth && (
        <TwoFactorCard initialEnabled={user.isTwoFactorEnabled} />
      )}
      <ProvidersCard user={user} />
    </>
  );
}
