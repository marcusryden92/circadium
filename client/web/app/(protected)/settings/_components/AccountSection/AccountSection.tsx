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
  };
}

export function AccountSection({ user }: AccountSectionProps) {
  return (
    <>
      <EmailCard user={user} />
      {!user.isOAuth && <PasswordCard userRole={user.role} />}
      {!user.isOAuth && (
        <TwoFactorCard
          initialEnabled={user.isTwoFactorEnabled}
          userRole={user.role}
        />
      )}
      <ProvidersCard user={user} />
    </>
  );
}
