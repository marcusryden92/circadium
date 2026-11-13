import { currentUser } from "@/lib/auth";
import type { SettingsPageUser } from "@/next-auth";
import { SettingsView } from "./_components/SettingsView";

export default async function SettingsPage() {
  const user = (await currentUser()) as SettingsPageUser | undefined;
  if (!user) return null;

  return (
    <SettingsView
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        isOAuth: user.isOAuth,
      }}
    />
  );
}
