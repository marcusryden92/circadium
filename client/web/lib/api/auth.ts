import { apiRequest } from "@/lib/api/client";
import { ensureFreshSession, replaceSession } from "@/lib/session/refresh";

// The Java account endpoints the auth pages call. Sign-ins send
// `client: "web"`: without it Java treats the caller as the mobile app and
// returns the tokens in the JSON body, readable by any script on the page,
// instead of setting HttpOnly cookies.

/** Where a correct email and password lead. */
export type SignInOutcome =
  | "signed-in"
  | "two-factor-required"
  | "verification-sent";

type SignInResponse = {
  status: "AUTHENTICATED" | "TWO_FACTOR_REQUIRED" | "EMAIL_VERIFICATION_SENT";
};

const OUTCOMES: Record<SignInResponse["status"], SignInOutcome> = {
  AUTHENTICATED: "signed-in",
  TWO_FACTOR_REQUIRED: "two-factor-required",
  EMAIL_VERIFICATION_SENT: "verification-sent",
};

export async function signInWithPassword(credentials: {
  email: string;
  password: string;
}): Promise<SignInOutcome> {
  return outcomeOf(
    await apiRequest<SignInResponse>("/auth/login", {
      body: { ...credentials, client: "web" },
    }),
  );
}

/** Java checks the password again, so the code is never the only secret. */
export async function verifyTwoFactorCode(input: {
  email: string;
  password: string;
  code: string;
}): Promise<SignInOutcome> {
  return outcomeOf(
    await apiRequest<SignInResponse>("/auth/2fa", {
      body: { ...input, client: "web" },
    }),
  );
}

/**
 * Answers the same whether or not the email is taken (the owner of a taken
 * address is emailed instead), so the form cannot reveal who has an account.
 */
export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  await apiRequest("/auth/register", { body: input });
}

/** Same answer for unknown emails, for the same reason as `register`. */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest("/auth/password-reset", { body: { email } });
}

export async function resetPassword(input: {
  token: string;
  password: string;
}): Promise<void> {
  await apiRequest("/auth/password-reset/confirm", { body: input });
}

export async function verifyEmail(token: string): Promise<void> {
  await apiRequest("/auth/verify-email", { body: { token } });
}

/**
 * Signs out every other browser and device. This browser stays signed in:
 * Java answers with new cookies, and the other tabs pick up the new expiry.
 *
 * Not `authenticated`: that option may refresh, which inside replaceSession's
 * lock would wait on itself. The cookie is made fresh before taking the lock
 * instead.
 */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await ensureFreshSession();
  await replaceSession(() =>
    apiRequest<{ accessTokenExpiresAt: string }>("/account/password", {
      body: { ...input, client: "web" },
    }),
  );
}

/**
 * Emails a confirmation link to the new address; the account moves once it is
 * opened. The current address is told about the request.
 */
export async function requestEmailChange(input: {
  currentPassword: string;
  newEmail: string;
}): Promise<void> {
  await apiRequest("/account/email", { body: input, authenticated: true });
}

/** The account is emailed about every change. */
export async function setTwoFactor(input: {
  currentPassword: string;
  enabled: boolean;
}): Promise<void> {
  await apiRequest("/account/two-factor", { body: input, authenticated: true });
}

/** `password` is required for accounts that have one. */
export async function requestAccountDeletion(input: {
  confirmEmail: string;
  password?: string;
}): Promise<void> {
  await apiRequest("/account/deletion", { body: input, authenticated: true });
}

export async function confirmAccountDeletion(token: string): Promise<void> {
  await apiRequest("/account/deletion/confirm", {
    body: { token },
    authenticated: true,
  });
}

/** Trades the code from a finished provider sign-in for session cookies. */
export async function redeemOAuthSignIn(input: {
  code: string;
  verifier: string;
}): Promise<void> {
  await apiRequest("/auth/handoff", { body: input });
}

/**
 * Opens the link mailed for a first sign-in through a provider that does not
 * vouch for the email (Microsoft). The account is created but nobody is signed
 * in; the answer names the provider to sign in with next.
 */
export async function confirmOAuthSignup(
  token: string,
): Promise<{ provider: string }> {
  return apiRequest<{ provider: string }>("/auth/oauth/confirm", {
    body: { token },
  });
}

function outcomeOf(response: SignInResponse | undefined): SignInOutcome {
  const outcome = response && OUTCOMES[response.status];
  if (!outcome) throw new Error("Unexpected sign-in response.");
  return outcome;
}
