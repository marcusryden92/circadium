import { act, renderHook } from "@testing-library/react";
import { useDispatch } from "react-redux";

import { useSignOut } from "@/hooks/useSignOut";
import { ApiError } from "@/lib/api/client";
import { signOut } from "@/lib/session/signOut";
import { pushToast } from "@/redux/slices/toastSlice";

jest.mock("react-redux", () => ({ useDispatch: jest.fn() }));
jest.mock("../../lib/session/signOut", () => ({ signOut: jest.fn() }));

const signOutMock = signOut as jest.MockedFunction<typeof signOut>;
const dispatch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (useDispatch as unknown as jest.Mock).mockReturnValue(dispatch);
});

describe("useSignOut", () => {
  it("signs out", async () => {
    signOutMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSignOut());

    await act(async () => result.current());

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("says the user is still signed in when the server cannot be reached", async () => {
    signOutMock.mockRejectedValue(new ApiError({ status: 0, message: "offline" }));
    const { result } = renderHook(() => useSignOut());

    await act(async () => result.current());

    expect(dispatch).toHaveBeenCalledWith({
      type: pushToast.type,
      payload: {
        id: expect.any(String),
        text: "You are still signed in. Could not reach the server. Check your connection and try again.",
      },
    });
  });

  it("ignores a second click while the first sign-out is out, and allows a retry after a failure", async () => {
    let fail: (error: unknown) => void = () => {};
    signOutMock.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    const { result } = renderHook(() => useSignOut());

    act(() => {
      result.current();
      result.current();
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);

    await act(async () => fail(new ApiError({ status: 503, message: "down" })));
    signOutMock.mockResolvedValue(undefined);
    await act(async () => result.current());

    expect(signOutMock).toHaveBeenCalledTimes(2);
  });
});
