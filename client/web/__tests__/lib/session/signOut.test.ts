/**
 * @jest-environment node
 */
import { ApiError, apiRequest } from "@/lib/api/client";
import { hardNavigate } from "@/lib/session/navigation";
import { forgetSession } from "@/lib/session/refresh";
import { signOut } from "@/lib/session/signOut";

jest.mock("../../../lib/api/client", () => {
  const actual = jest.requireActual("../../../lib/api/client");
  return { ...actual, apiRequest: jest.fn() };
});
jest.mock("../../../lib/session/navigation", () => ({ hardNavigate: jest.fn() }));
jest.mock("../../../lib/session/refresh", () => ({ forgetSession: jest.fn() }));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

beforeEach(() => jest.clearAllMocks());

describe("signOut", () => {
  it("ends the session on the server, tells the other tabs, then leaves", async () => {
    apiRequestMock.mockResolvedValue(undefined);

    await signOut();

    expect(apiRequestMock).toHaveBeenCalledWith("/auth/logout", { method: "POST" });
    expect(forgetSession).toHaveBeenCalled();
    expect(hardNavigate).toHaveBeenCalledWith("/");
  });

  it("goes where it is told", async () => {
    apiRequestMock.mockResolvedValue(undefined);

    await signOut({ redirectTo: "/auth/login" });

    expect(hardNavigate).toHaveBeenCalledWith("/auth/login");
  });

  it("stays put and rejects when the server cannot be reached", async () => {
    const failure = new ApiError({ status: 0, message: "Could not reach the server." });
    apiRequestMock.mockRejectedValue(failure);

    await expect(signOut()).rejects.toBe(failure);
    expect(forgetSession).not.toHaveBeenCalled();
    expect(hardNavigate).not.toHaveBeenCalled();
  });
});
