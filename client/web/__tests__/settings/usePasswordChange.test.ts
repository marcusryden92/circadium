import { act, renderHook } from "@testing-library/react";

import { usePasswordChange } from "@/app/(protected)/settings/_components/PasswordCard/usePasswordChange";
import { ApiError } from "@/lib/api/client";
import { changePassword } from "@/lib/api/auth";

jest.mock("../../lib/api/auth", () => ({ changePassword: jest.fn() }));
jest.mock("../../lib/session/refresh", () => ({
  ensureFreshSession: jest.fn().mockResolvedValue(true),
}));

const changePasswordMock = changePassword as jest.MockedFunction<typeof changePassword>;

function fill(
  result: { current: ReturnType<typeof usePasswordChange> },
  values: { current: string; next: string; confirm: string },
) {
  act(() => {
    result.current.setters.setPassword(values.current);
    result.current.setters.setNewPassword(values.next);
    result.current.setters.setConfirmNewPassword(values.confirm);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("usePasswordChange", () => {
  it("changes the password through Java and says the other devices were signed out", async () => {
    changePasswordMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePasswordChange());
    fill(result, { current: "old-pw", next: "new-password", confirm: "new-password" });

    await act(async () => result.current.submit());

    expect(changePasswordMock).toHaveBeenCalledWith({
      currentPassword: "old-pw",
      newPassword: "new-password",
    });
    expect(result.current.status).toEqual({
      tone: "success",
      text: "Password changed. Other browsers and devices were signed out.",
    });
    expect(result.current.values).toEqual({
      password: "",
      newPassword: "",
      confirmNewPassword: "",
    });
  });

  it.each([
    [{ current: "old-pw", next: "new-password", confirm: "new-passwort" }, "New passwords don't match."],
    [{ current: "old-pw", next: "eleven-char", confirm: "eleven-char" }, "New password: At least 12 characters."],
  ])("checks the form before sending it: %o", async (values, message) => {
    const { result } = renderHook(() => usePasswordChange());
    fill(result, values);

    await act(async () => result.current.submit());

    expect(changePasswordMock).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ tone: "error", text: message });
  });

  it("shows Java's refusal and keeps what was typed", async () => {
    changePasswordMock.mockRejectedValue(
      new ApiError({ status: 403, code: "bad_password", message: "Incorrect password." }),
    );
    const { result } = renderHook(() => usePasswordChange());
    fill(result, { current: "wrong-pw", next: "new-password", confirm: "new-password" });

    await act(async () => result.current.submit());

    expect(result.current.status).toEqual({ tone: "error", text: "Incorrect password." });
    expect(result.current.values.password).toBe("wrong-pw");
  });
});
