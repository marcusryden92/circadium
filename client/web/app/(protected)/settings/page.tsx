import { currentUser } from "@/lib/auth";
import { SettingsView } from "./_components/SettingsView";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) return null;

  return (
    <SettingsView
      user={{
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        role: user.role,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        isOAuth: user.isOAuth,
        signInProviders: user.signInProviders,
      }}
    />
  );
}
