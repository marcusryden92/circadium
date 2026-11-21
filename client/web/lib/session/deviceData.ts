import { clearAiKey } from "@/lib/aiKey";

// Browser only. What an account leaves on this device: localStorage entries
// scoped to the user (keys ending in `.<userId>`, the convention every
// user-scoped key follows, e.g. onboarding progress with its brain-dump
// jots) and the encrypted AI key vault. The vault's key cannot be exported,
// but anyone at this browser profile could still use it to decrypt, so an
// explicit sign-out removes it; the user enters the key again next time.
//
// The theme choice stays: it is a display preference, not account data.

const KEPT_PREFIXES = ["theme."];

export async function forgetDeviceData(userId: string): Promise<void> {
  try {
    const suffix = `.${userId}`;
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key?.endsWith(suffix) &&
        !KEPT_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked: there is nothing stored to remove either.
  }
  await clearAiKey(userId);
}
