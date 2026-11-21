/**
 * @jest-environment node
 */
import { apiRequest } from "@/lib/api/client";
import {
  confirmAccountDeletion,
  redeemGoogleSignIn,
  register,
  requestAccountDeletion,
  requestPasswordReset,
  resetPassword,
  signInWithPassword,
  verifyEmail,
  verifyTwoFactorCode,
} from "@/lib/api/auth";

jest.mock("../../../lib/api/client", () => {
  const actual = jest.requireActual("../../../lib/api/client");
  return { ...actual, apiRequest: jest.fn() };
});

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

beforeEach(() => {
  jest.clearAllMocks();
  apiRequestMock.mockResolvedValue(undefined);
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
    await redeemGoogleSignIn({ code: "c".repeat(43), verifier: "v".repeat(43) });

    expect(apiRequestMock.mock.calls).toEqual([
      ["/auth/register", { body: { name: "Ada", email: "ada@example.com", password: "long enough" } }],
      ["/auth/password-reset", { body: { email: "ada@example.com" } }],
      ["/auth/password-reset/confirm", { body: { token: "t1", password: "long enough" } }],
      ["/auth/verify-email", { body: { token: "t2" } }],
      ["/auth/handoff", { body: { code: "c".repeat(43), verifier: "v".repeat(43) } }],
    ]);
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
});
