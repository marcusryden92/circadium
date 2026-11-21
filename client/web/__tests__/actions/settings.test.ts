/**
 * @jest-environment node
 */
import bcrypt from "bcryptjs";
import { headers } from "next/headers";

import { settings } from "@/actions/settings";
import { getUserById } from "@/data/user";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("bcryptjs", () => ({ compare: jest.fn(), hash: jest.fn() }));
jest.mock("../../lib/auth", () => ({ currentUser: jest.fn() }));
jest.mock("../../data/user", () => ({
  getUserById: jest.fn(),
  getUserByEmail: jest.fn(),
}));
jest.mock("../../lib/tokens", () => ({ generateVerificationToken: jest.fn() }));
jest.mock("../../lib/mail", () => ({ sendVerificationEmail: jest.fn() }));
jest.mock("../../lib/db", () => ({
  db: {
    $transaction: jest.fn(),
    user: { update: jest.fn() },
    session: { deleteMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

const dbMock = db as unknown as {
  $transaction: jest.Mock;
  user: { update: jest.Mock };
  session: { deleteMany: jest.Mock };
  auditLog: { create: jest.Mock };
};
const compareMock = bcrypt.compare as unknown as jest.Mock;
const hashMock = bcrypt.hash as unknown as jest.Mock;

const SESSION_USER = {
  id: "user-1",
  name: "Ada",
  email: "Ada@Example.com",
  role: "USER" as const,
  isTwoFactorEnabled: false,
  isOAuth: false,
};

const PASSWORD_CHANGE = {
  role: "USER" as const,
  password: "old-password",
  newPassword: "new-password-1",
  confirmNewPassword: "new-password-1",
};

beforeEach(() => {
  jest.clearAllMocks();
  (currentUser as jest.Mock).mockResolvedValue(SESSION_USER);
  (getUserById as jest.Mock).mockResolvedValue({
    id: "user-1",
    email: "Ada@Example.com",
    password: "$2b$10$stored-hash",
  });
  (headers as jest.Mock).mockResolvedValue(
    new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "user-agent": "Firefox",
    }),
  );
  compareMock.mockResolvedValue(true);
  hashMock.mockResolvedValue("$2b$10$new-hash");
  // Prisma's batch form receives the queries the calls above built.
  dbMock.user.update.mockReturnValue("user-update");
  dbMock.session.deleteMany.mockReturnValue("sessions-delete");
  dbMock.auditLog.create.mockReturnValue("audit-insert");
  dbMock.$transaction.mockResolvedValue([]);
});

describe("settings, changing the password", () => {
  it("ends every session in the same transaction as the new hash, and records it", async () => {
    const result = await settings(PASSWORD_CHANGE);

    expect(result).toEqual({ success: "Password changed.", signedOut: true });
    expect(dbMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        password: "$2b$10$new-hash",
        passwordChangedAt: expect.any(Date),
      },
    });
    expect(dbMock.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(dbMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        event: "PASSWORD_CHANGED",
        email: "ada@example.com",
        ipAddress: "203.0.113.7",
        userAgent: "Firefox",
      },
    });
    expect(dbMock.$transaction).toHaveBeenCalledWith([
      "user-update",
      "sessions-delete",
      "audit-insert",
    ]);
  });

  it("changes nothing when the current password is wrong", async () => {
    compareMock.mockResolvedValue(false);

    const result = await settings(PASSWORD_CHANGE);

    expect(result).toEqual({ error: "Incorrect password!" });
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(dbMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it("leaves the sessions alone for a change that is not the password", async () => {
    dbMock.user.update.mockResolvedValue({});

    const result = await settings({ role: "USER", name: "Ada L." });

    expect(result).toEqual({ success: "Settings updated!" });
    expect(dbMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Ada L." },
    });
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(dbMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it("ignores a password change from an account without a password", async () => {
    (currentUser as jest.Mock).mockResolvedValue({ ...SESSION_USER, isOAuth: true });

    await settings(PASSWORD_CHANGE);

    expect(dbMock.session.deleteMany).not.toHaveBeenCalled();
    expect(hashMock).not.toHaveBeenCalled();
  });
});
