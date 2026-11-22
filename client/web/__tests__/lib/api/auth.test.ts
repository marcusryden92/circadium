/**
 * @jest-environment node
 */
import { apiRequest } from "@/lib/api/client";
import { ensureFreshSession, replaceSession } from "@/lib/session/refresh";
import {
  changePassword,
  confirmAccountDeletion,
  confirmOAuthSignup,
  redeemOAuthSignIn,
  register,
  requestAccountDeletion,
  requestEmailChange,
  requestPasswordReset,
  resetPassword,
  setTwoFactor,
  signInWithPassword,
  verifyEmail,
  verifyTwoFactorCode,
} from "@/lib/api/auth";

jest.mock("../../../lib/api/client", () => {
  const actual = jest.requireActual("../../../lib/api/client");
  return { ...actual, apiRequest: jest.fn() };
});

jest.mock("../../../lib/session/refresh", () => ({
  ensureFreshSession: jest.fn(),
  replaceSession: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;
const ensureFreshMock = ensureFreshSession as jest.MockedFunction<typeof ensureFreshSession>;
const replaceSessionMock = replaceSession as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  apiRequestMock.mockResolvedValue(undefined);
  ensureFreshMock.mockResolvedValue(true);
  replaceSessionMock.mockImplementation((request: () => Promise<unknown>) => request());
});

describe("signing in", () => {
  it.each([
    ["AUTHENTICATED", "signed-in"],
    ["TWO_FACTOR_REQUIRED", "two-factor-required"],
    ["EMAIL_VERIFICATION_SENT", "verification-sent"],
  ])("maps %s to %s", async (status, outcome) => {
    apiRequestMock.mockResolvedValue({ status });

    await expect(
      signInWithPassword({ email: "ada@example.com", password: "secret" }),
    ).resolves.toBe(outcome);
  });

  it("asks for cookies, not tokens in the body", async () => {
    apiRequestMock.mockResolvedValue({ status: "AUTHENTICATED" });

    await signInWithPassword({ email: "ada@example.com", password: "secret" });
    await verifyTwoFactorCode({
      email: "ada@example.com",
      password: "secret",
      code: "123456",
    });

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/auth/login", {
      body: { email: "ada@example.com", password: "secret", client: "web" },
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/auth/2fa", {
      body: {
        email: "ada@example.com",
        password: "secret",
        code: "123456",
        client: "web",
      },
    });
  });

  it("refuses a response it does not understand", async () => {
    apiRequestMock.mockResolvedValue({ status: "SOMETHING_NEW" });

    await expect(
      signInWithPassword({ email: "ada@example.com", password: "secret" }),
    ).rejects.toThrow("Unexpected sign-in response.");
  });
});

describe("the account flows", () => {
  it("send the public ones without a session", async () => {
    await register({ name: "Ada", email: "ada@example.com", password: "long enough" });
    await requestPasswordReset("ada@example.com");
    await resetPassword({ token: "t1", password: "long enough" });
    await verifyEmail("t2");
    await redeemOAuthSignIn({ code: "c".repeat(43), verifier: "v".repeat(43) });
    await confirmOAuthSignup("t".repeat(43));

    expect(apiRequestMock.mock.calls).toEqual([
      ["/auth/register", { body: { name: "Ada", email: "ada@example.com", password: "long enough" } }],
      ["/auth/password-reset", { body: { email: "ada@example.com" } }],
      ["/auth/password-reset/confirm", { body: { token: "t1", password: "long enough" } }],
      ["/auth/verify-email", { body: { token: "t2" } }],
      ["/auth/handoff", { body: { code: "c".repeat(43), verifier: "v".repeat(43) } }],
      ["/auth/oauth/confirm", { body: { token: "t".repeat(43) } }],
    ]);
  });

  it("change the password inside replaceSession, with the cookie made fresh beforehand", async () => {
    const order: string[] = [];
    ensureFreshMock.mockImplementation(async () => {
      order.push("fresh");
      return true;
    });
    replaceSessionMock.mockImplementation(async (request: () => Promise<unknown>) => {
      order.push("lock");
      return request();
    });
    apiRequestMock.mockResolvedValue({ accessTokenExpiresAt: "2026-11-21T15:00:00Z" });

    await changePassword({ currentPassword: "old-password", newPassword: "new-password" });

    expect(order).toEqual(["fresh", "lock"]);
    // Not `authenticated`: its refresh would wait on the lock replaceSession holds.
    expect(apiRequestMock).toHaveBeenCalledWith("/account/password", {
      body: { currentPassword: "old-password", newPassword: "new-password", client: "web" },
    });
  });

  it("send the deletion steps as the signed-in user", async () => {
    await requestAccountDeletion({ confirmEmail: "ada@example.com", password: "secret" });
    await confirmAccountDeletion("t3");

    expect(apiRequestMock.mock.calls).toEqual([
      [
        "/account/deletion",
        { body: { confirmEmail: "ada@example.com", password: "secret" }, authenticated: true },
      ],
      ["/account/deletion/confirm", { body: { token: "t3" }, authenticated: true }],
    ]);
  });

  it("send the email change and the two-factor switch as the signed-in user, with the password", async () => {
    await requestEmailChange({ currentPassword: "secret", newEmail: "new@example.com" });
    await setTwoFactor({ currentPassword: "secret", enabled: false });

    expect(apiRequestMock.mock.calls).toEqual([
      [
        "/account/email",
        { body: { currentPassword: "secret", newEmail: "new@example.com" }, authenticated: true },
      ],
      [
        "/account/two-factor",
        { body: { currentPassword: "secret", enabled: false }, authenticated: true },
      ],
    ]);
  });
});
