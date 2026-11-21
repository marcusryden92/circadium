import { apiRequest } from "@/lib/api/client";
import { forgetDeviceData } from "@/lib/session/deviceData";
import { hardNavigate } from "@/lib/session/navigation";
import { forgetSession } from "@/lib/session/refresh";

/**
 * Ends the session on the server (Java revokes the refresh token and clears
 * both cookies), tells the other tabs, removes `userId`'s data from this
 * device, then loads `redirectTo`.
 *
 * Rejects with ApiError when the server could not be reached. The caller must
 * tell the user, because the cookies are still set and the session is still
 * live: navigating away as if it worked would leave a shared computer signed in.
 */
export async function signOut(
  options: { redirectTo?: string; userId?: string } = {},
): Promise<void> {
  await apiRequest<void>("/auth/logout", { method: "POST" });
  forgetSession();
  if (options.userId) await forgetDeviceData(options.userId);
  hardNavigate(options.redirectTo ?? "/");
}
