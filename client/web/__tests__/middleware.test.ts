/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

import middleware from "@/middleware";
import { verifyAccessToken } from "@/lib/session/accessToken";

jest.mock("../lib/session/accessToken", () => ({
  verifyAccessToken: jest.fn(),
}));

const verifyMock = verifyAccessToken as jest.MockedFunction<
  typeof verifyAccessToken
>;

const CLAIMS = {
  userId: "user-1",
  role: "USER",
  sessionId: "family-1",
  issuedAt: 1_800_000_000,
  expiresAt: 1_800_000_900,
  twoFactorVerified: false,
};

function request(path: string, cookie?: string, authorization?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

function passedThrough(response: Response) {
  return response.headers.get("x-middleware-next") === "1";
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.STAGING_PASSWORD;
});

describe("middleware", () => {
  it("sends a request without a token to the login page, keeping where it was going", async () => {
    const response = await middleware(request("/calendar?date=2026-11-21"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth/login");
    expect(location.searchParams.get("callbackUrl")).toBe(
      "/calendar?date=2026-11-21",
    );
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("lets a valid token through", async () => {
    verifyMock.mockResolvedValue(CLAIMS);

    const response = await middleware(
      request("/dashboard", "circadium_access=good-token"),
    );

    expect(passedThrough(response)).toBe(true);
    expect(verifyMock).toHaveBeenCalledWith("good-token");
  });

  it("treats a rejected token like no token", async () => {
    verifyMock.mockResolvedValue(null);

    const response = await middleware(
      request("/settings", "circadium_access=expired"),
    );

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe(
      "/auth/login",
    );
  });

  it("protects the API routes too", async () => {
    const response = await middleware(
      request("/api/integrations/google/connect"),
    );

    expect(response.status).toBe(307);
  });

  it("answers 503 when the token cannot be checked, instead of signing the user out", async () => {
    verifyMock.mockRejectedValue(new Error("JWKS fetch failed"));

    const response = await middleware(
      request("/dashboard", "circadium_access=some-token"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("location")).toBeNull();
  });

  it.each(["/", "/privacy", "/auth/confirm-deletion", "/auth/oauth/complete"])(
    "leaves the public page %s open without checking anything",
    async (path) => {
      const response = await middleware(request(path));

      expect(passedThrough(response)).toBe(true);
      expect(verifyMock).not.toHaveBeenCalled();
    },
  );

  it.each(["/auth/login", "/auth/register", "/auth/reset", "/auth/new-password"])(
    "leaves %s open without a token (the login page must not redirect to itself)",
    async (path) => {
      const response = await middleware(request(path));

      expect(passedThrough(response)).toBe(true);
    },
  );

  it.each(["/auth/login", "/auth/register", "/auth/reset", "/auth/new-password"])(
    "leaves %s open even with a token, which the server may still refuse",
    async (path) => {
      verifyMock.mockResolvedValue(CLAIMS);

      const response = await middleware(
        request(path, "circadium_access=good-token"),
      );

      expect(passedThrough(response)).toBe(true);
    },
  );

  it("reads the token from the cookie this environment is configured for", async () => {
    process.env.AUTH_ACCESS_COOKIE = "circadium_staging_access";
    try {
      verifyMock.mockResolvedValue(CLAIMS);

      const response = await middleware(
        request(
          "/dashboard",
          "circadium_access=prod-token; circadium_staging_access=staging-token",
        ),
      );

      expect(passedThrough(response)).toBe(true);
      expect(verifyMock).toHaveBeenCalledWith("staging-token");
    } finally {
      delete process.env.AUTH_ACCESS_COOKIE;
    }
  });

  it("puts the staging password in front of everything, sign-in included", async () => {
    process.env.STAGING_PASSWORD = "let-me-in";

    const locked = await middleware(request("/auth/login"));
    const open = await middleware(
      request("/auth/login", undefined, `Basic ${btoa("any:let-me-in")}`),
    );

    expect(locked.status).toBe(401);
    expect(locked.headers.get("www-authenticate")).toContain("Basic");
    expect(passedThrough(open)).toBe(true);
  });
});
