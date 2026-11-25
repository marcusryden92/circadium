/**
 * @jest-environment node
 */
import { cookies } from "next/headers";

import { getSession } from "@/lib/session/session";

jest.mock("next/headers", () => ({ cookies: jest.fn() }));

const cookiesMock = cookies as jest.MockedFunction<typeof cookies>;
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function withCookies(values: Record<string, string>) {
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name in values ? { name, value: values[name] } : undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

function sessionPayload(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      role: "USER",
      isTwoFactorEnabled: false,
      isOAuth: false,
      signInProviders: [],
      onboardedAt: null,
      aiMode: null,
      aiModel: null,
      ...((overrides.user as Record<string, unknown>) ?? {}),
    },
    accessTokenExpiresAt: "2027-01-01T00:15:00Z",
    twoFactorVerified: false,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "user"),
    ),
  };
}

function answer(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue(answer(200, sessionPayload()));
});

describe("getSession", () => {
  it("is null without an access cookie, and checks nothing", async () => {
    withCookies({});

    await expect(getSession()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Java's session endpoint with the cookie's token as bearer", async () => {
    withCookies({ circadium_access: "token" });

    await expect(getSession()).resolves.toEqual(sessionPayload());
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/session$/);
    expect(init.headers).toEqual({ Authorization: "Bearer token" });
    expect(init.cache).toBe("no-store");
  });

  it("is null when Java answers 401 (ended sign-in, deleted account, password change)", async () => {
    withCookies({ circadium_access: "token" });
    fetchMock.mockResolvedValue(answer(401, { code: "session_ended" }));

    await expect(getSession()).resolves.toBeNull();
  });

  it("throws when Java cannot be checked, so callers can tell it from signed out", async () => {
    withCookies({ circadium_access: "token" });
    fetchMock.mockResolvedValue(answer(503));

    await expect(getSession()).rejects.toThrow("session check failed");
  });

  it("retries a failing check before giving up", async () => {
    withCookies({ circadium_access: "token" });
    fetchMock
      .mockResolvedValueOnce(answer(502))
      .mockResolvedValueOnce(answer(200, sessionPayload()));

    await expect(getSession()).resolves.toEqual(sessionPayload());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes the session payload through as the session", async () => {
    withCookies({ circadium_access: "token" });
    fetchMock.mockResolvedValue(
      answer(
        200,
        sessionPayload({
          user: {
            role: "ADMIN",
            isTwoFactorEnabled: true,
            isOAuth: true,
            signInProviders: ["google", "apple"],
            onboardedAt: "2026-01-02T03:04:05Z",
            aiMode: "BYOK",
          },
          twoFactorVerified: true,
        }),
      ),
    );

    await expect(getSession()).resolves.toMatchObject({
      user: {
        role: "ADMIN",
        isOAuth: true,
        signInProviders: ["google", "apple"],
        onboardedAt: "2026-01-02T03:04:05Z",
        aiMode: "BYOK",
      },
      twoFactorVerified: true,
    });
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
      expect(fetchMock.mock.calls[0][1].headers).toEqual({
        Authorization: "Bearer staging-token",
      });
    } finally {
      if (previous === undefined) delete process.env.AUTH_ACCESS_COOKIE;
      else process.env.AUTH_ACCESS_COOKIE = previous;
    }
  });
});
