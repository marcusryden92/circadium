import { apiRequest } from "@/lib/api/client";

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

/** Trades the code from a finished Google sign-in for session cookies. */
export async function redeemGoogleSignIn(input: {
  code: string;
  verifier: string;
}): Promise<void> {
  await apiRequest("/auth/handoff", { body: input });
}

function outcomeOf(response: SignInResponse | undefined): SignInOutcome {
  const outcome = response && OUTCOMES[response.status];
  if (!outcome) throw new Error("Unexpected sign-in response.");
  return outcome;
}
