/**
 * @jest-environment node
 */
import { isAdminSession } from "@/lib/auth";
import type { Session } from "@/lib/session/session";

jest.mock("../../auth", () => ({ auth: jest.fn() }));

function session(role: "ADMIN" | "USER", twoFactorVerified: boolean): Session {
  return {
    user: {
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      role,
      isTwoFactorEnabled: true,
      isOAuth: false,
      signInProviders: [],
      onboardedAt: null,
      aiMode: null,
      aiModel: null,
    },
    accessTokenExpiresAt: "2026-11-21T10:15:00.000Z",
    twoFactorVerified,
  };
}

describe("isAdminSession", () => {
  it("needs the ADMIN role and a sign-in that passed the emailed code", () => {
    expect(isAdminSession(session("ADMIN", true))).toBe(true);
    expect(isAdminSession(session("ADMIN", false))).toBe(false);
    expect(isAdminSession(session("USER", true))).toBe(false);
    expect(isAdminSession(null)).toBe(false);
  });
});
