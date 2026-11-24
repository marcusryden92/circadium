/**
 * @jest-environment node
 */
import { settings } from "@/actions/settings";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

jest.mock("../../lib/auth", () => ({ currentUser: jest.fn() }));
jest.mock("../../lib/db", () => ({
  db: { user: { update: jest.fn() } },
}));

const updateMock = (db.user as unknown as { update: jest.Mock }).update;

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
  updateMock.mockResolvedValue({});
});

describe("settings", () => {
  it("updates the name", async () => {
    const result = await settings({ name: "Ada L." });

    expect(result).toEqual({ success: "Settings updated!" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Ada L." },
    });
  });

  it("ignores the sign-in fields: those need the password and go through the Java API", async () => {
    const result = await settings({
      email: "someone-else@example.com",
      isTwoFactorEnabled: false,
      role: "ADMIN",
      password: "anything",
    } as Parameters<typeof settings>[0]);

    expect(result).toEqual({ success: "Settings updated!" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses a caller without a session", async () => {
    (currentUser as jest.Mock).mockResolvedValue(undefined);

    await expect(settings({ name: "Mallory" })).resolves.toEqual({
      error: "Unauthorized.",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
