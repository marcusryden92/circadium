/**
 * @jest-environment node
 */
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { verifyAccessToken } from "@/lib/session/accessToken";
import { getSession, issuedBeforePasswordChange } from "@/lib/session/session";

jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("../../../lib/db", () => ({
  db: { user: { findUnique: jest.fn() } },
}));
jest.mock("../../../lib/session/accessToken", () => ({
  verifyAccessToken: jest.fn(),
}));

const cookiesMock = cookies as jest.MockedFunction<typeof cookies>;
const verifyMock = verifyAccessToken as jest.MockedFunction<
  typeof verifyAccessToken
>;
const findUserMock = db.user.findUnique as unknown as jest.Mock;

const ISSUED_AT = 1_800_000_000;

function withCookies(values: Record<string, string>) {
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name in values ? { name, value: values[name] } : undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    role: "USER",
    isTwoFactorEnabled: false,
    passwordChangedAt: null,
    accounts: [],
    sessions: [{ id: "session-1" }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  verifyMock.mockResolvedValue({
    userId: "user-1",
    role: "USER",
    sessionId: "family-1",
    issuedAt: ISSUED_AT,
    expiresAt: ISSUED_AT + 900,
    twoFactorVerified: false,
  });
  findUserMock.mockResolvedValue(userRow());
});

describe("getSession", () => {
  it("is null without an access cookie, and checks nothing", async () => {
    withCookies({});

    await expect(getSession()).resolves.toBeNull();
    expect(verifyMock).not.toHaveBeenCalled();
    expect(findUserMock).not.toHaveBeenCalled();
  });

  it("is null when the token fails verification", async () => {
    withCookies({ circadium_access: "bad" });
    verifyMock.mockResolvedValue(null);

    await expect(getSession()).resolves.toBeNull();
    expect(findUserMock).not.toHaveBeenCalled();
  });

  it("builds the session from the token's user row", async () => {
    withCookies({ circadium_access: "token" });
    findUserMock.mockResolvedValue(
      userRow({ role: "ADMIN", isTwoFactorEnabled: true }),
    );

    await expect(getSession()).resolves.toEqual({
      user: {
        id: "user-1",
        name: "Ada",
        email: "ada@example.com",
        role: "ADMIN",
        isTwoFactorEnabled: true,
        isOAuth: false,
      },
      accessTokenExpiresAt: new Date((ISSUED_AT + 900) * 1000).toISOString(),
      twoFactorVerified: false,
    });
    expect(verifyMock).toHaveBeenCalledWith("token");
    expect(findUserMock.mock.calls[0][0].where).toEqual({ id: "user-1" });
  });

  it("is null once the token's sign-in has ended, though the token is still valid", async () => {
    withCookies({ circadium_access: "token" });
    findUserMock.mockResolvedValue(userRow({ sessions: [] }));

    await expect(getSession()).resolves.toBeNull();
    expect(findUserMock.mock.calls[0][0].select.sessions.where).toEqual({
      familyId: "family-1",
    });
  });

  it("says whether this sign-in passed the emailed code", async () => {
    withCookies({ circadium_access: "token" });
    verifyMock.mockResolvedValue({
      userId: "user-1",
      role: "USER",
      sessionId: "family-1",
      issuedAt: ISSUED_AT,
      expiresAt: ISSUED_AT + 900,
      twoFactorVerified: true,
    });

    await expect(getSession()).resolves.toMatchObject({ twoFactorVerified: true });
  });

  it("marks accounts with a provider link as OAuth", async () => {
    withCookies({ circadium_access: "token" });
    findUserMock.mockResolvedValue(userRow({ accounts: [{ id: "acc-1" }] }));

    await expect(getSession()).resolves.toMatchObject({
      user: { isOAuth: true },
    });
  });

  it("is null when the account no longer exists", async () => {
    withCookies({ circadium_access: "token" });
    findUserMock.mockResolvedValue(null);

    await expect(getSession()).resolves.toBeNull();
  });

  it("is null for a token issued before the last password change", async () => {
    withCookies({ circadium_access: "token" });
    findUserMock.mockResolvedValue(
      userRow({ passwordChangedAt: new Date((ISSUED_AT + 60) * 1000) }),
    );

    await expect(getSession()).resolves.toBeNull();
  });

  it("reads the cookie named by AUTH_ACCESS_COOKIE", async () => {
    const previous = process.env.AUTH_ACCESS_COOKIE;
    process.env.AUTH_ACCESS_COOKIE = "circadium_staging_access";
    try {
      withCookies({
        circadium_access: "prod-token",
        circadium_staging_access: "staging-token",
      });

      await getSession();
      expect(verifyMock).toHaveBeenCalledWith("staging-token");
    } finally {
      if (previous === undefined) delete process.env.AUTH_ACCESS_COOKIE;
      else process.env.AUTH_ACCESS_COOKIE = previous;
    }
  });
});

describe("issuedBeforePasswordChange", () => {
  const changedAt = new Date(ISSUED_AT * 1000 + 400);

  it("is false when the password was never changed", () => {
    expect(issuedBeforePasswordChange(ISSUED_AT, null)).toBe(false);
  });

  it("is true for a token from an earlier second", () => {
    expect(issuedBeforePasswordChange(ISSUED_AT - 1, changedAt)).toBe(true);
  });

  it("accepts a token from the same second as the change", () => {
    expect(issuedBeforePasswordChange(ISSUED_AT, changedAt)).toBe(false);
  });

  it("accepts a token from after the change", () => {
    expect(issuedBeforePasswordChange(ISSUED_AT + 1, changedAt)).toBe(false);
  });
});
