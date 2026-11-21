/**
 * @jest-environment node
 */
import { settings } from "@/actions/settings";
import { getUserById } from "@/data/user";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

jest.mock("../../lib/auth", () => ({ currentUser: jest.fn() }));
jest.mock("../../data/user", () => ({
  getUserById: jest.fn(),
  getUserByEmail: jest.fn(),
}));
jest.mock("../../lib/tokens", () => ({ generateVerificationToken: jest.fn() }));
jest.mock("../../lib/mail", () => ({ sendVerificationEmail: jest.fn() }));
jest.mock("../../lib/db", () => ({
  db: { user: { update: jest.fn() } },
}));

const updateMock = db.user.update as unknown as jest.Mock;

const SESSION_USER = {
  id: "user-1",
  name: "Ada",
  email: "Ada@Example.com",
  role: "USER" as const,
  isTwoFactorEnabled: false,
  isOAuth: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  (currentUser as jest.Mock).mockResolvedValue(SESSION_USER);
  (getUserById as jest.Mock).mockResolvedValue({
    id: "user-1",
    email: "Ada@Example.com",
    password: "$2b$10$stored-hash",
  });
  updateMock.mockResolvedValue({});
});

describe("settings", () => {
  it("updates only the whitelisted columns", async () => {
    const result = await settings({
      role: "USER",
      name: "Ada L.",
      isTwoFactorEnabled: true,
    });

    expect(result).toEqual({ success: "Settings updated!" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Ada L.", isTwoFactorEnabled: true },
    });
  });

  it("does not take a password: that goes through the Java API", async () => {
    const result = await settings({
      role: "USER",
      password: "old-password",
      newPassword: "new-password-1",
      confirmNewPassword: "new-password-1",
    } as Parameters<typeof settings>[0]);

    expect(result).toEqual({ success: "Settings updated!" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("ignores the two-factor switch for an account without a password", async () => {
    (currentUser as jest.Mock).mockResolvedValue({ ...SESSION_USER, isOAuth: true });

    await settings({ role: "USER", isTwoFactorEnabled: true });

    expect(updateMock).not.toHaveBeenCalled();
  });
});
