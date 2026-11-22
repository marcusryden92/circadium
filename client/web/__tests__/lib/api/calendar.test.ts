/**
 * @jest-environment node
 */
import type { DatabaseChanges } from "@circadium/shared/contracts";
import { ApiError, NETWORK_ERROR, apiRequest } from "@/lib/api/client";
import {
  fetchCalendarBootstrap,
  syncCalendarChanges,
} from "@/lib/api/calendar";

jest.mock("../../../lib/api/client", () => {
  const actual = jest.requireActual("../../../lib/api/client");
  return { ...actual, apiRequest: jest.fn() };
});

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

const emptyGroup = { create: [], update: [], destroy: [] };
const changes: DatabaseChanges = {
  planner: emptyGroup,
  calendar: emptyGroup,
  template: emptyGroup,
  extendedProps: emptyGroup,
  category: emptyGroup,
  categoryTimeWindow: emptyGroup,
  categoryEvent: emptyGroup,
  travelEvent: emptyGroup,
  engineMessage: emptyGroup,
  queue: emptyGroup,
  queueMember: emptyGroup,
  dependency: emptyGroup,
  location: emptyGroup,
  travelTime: emptyGroup,
};

function apiError(
  status: number,
  code?: string,
  problem: Record<string, unknown> = {},
) {
  return new ApiError({ status, code, message: `status ${status}`, problem });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("fetchCalendarBootstrap", () => {
  it("reads the bootstrap as the signed-in user", async () => {
    apiRequestMock.mockResolvedValue({ dataVersion: 3 });

    await expect(fetchCalendarBootstrap()).resolves.toEqual({ dataVersion: 3 });
    expect(apiRequestMock).toHaveBeenCalledWith("/calendar/bootstrap", {
      authenticated: true,
    });
  });
});

describe("syncCalendarChanges", () => {
  it("posts the diff with the known version as the signed-in user", async () => {
    apiRequestMock.mockResolvedValue({ newDataVersion: 8 });

    await expect(syncCalendarChanges(changes, 7)).resolves.toEqual({
      success: true,
      newDataVersion: 8,
    });
    expect(apiRequestMock).toHaveBeenCalledWith("/calendar/sync", {
      body: { changes, clientKnownDataVersion: 7 },
      authenticated: true,
    });
  });

  it("hands back the account's current data on a stale sync", async () => {
    const freshState = { dataVersion: 9, planner: [] };
    apiRequestMock.mockRejectedValue(apiError(409, "stale", { freshState }));

    await expect(syncCalendarChanges(changes, 7)).resolves.toEqual({
      success: false,
      reason: "stale",
      freshState,
    });
  });

  it("treats a 409 without the current data as a rejected diff", async () => {
    apiRequestMock.mockRejectedValue(apiError(409, "stale"));

    await expect(syncCalendarChanges(changes, 7)).resolves.toMatchObject({
      success: false,
      reason: "error",
    });
  });

  it.each([400, 401, 404, 500])(
    "reports a %i answer as a rejected diff, so the client snaps back",
    async (status) => {
      apiRequestMock.mockRejectedValue(apiError(status));

      await expect(syncCalendarChanges(changes, 7)).resolves.toEqual({
        success: false,
        reason: "error",
        error: `status ${status}`,
      });
    },
  );

  it.each([502, 503, 504])(
    "throws on a %i from the host's proxy, so the loop retries",
    async (status) => {
      const error = apiError(status);
      apiRequestMock.mockRejectedValue(error);

      await expect(syncCalendarChanges(changes, 7)).rejects.toBe(error);
    },
  );

  it("throws when no answer arrived, so the loop retries", async () => {
    const error = new ApiError({
      status: 0,
      code: NETWORK_ERROR,
      message: "Could not reach the server.",
    });
    apiRequestMock.mockRejectedValue(error);

    await expect(syncCalendarChanges(changes, 7)).rejects.toBe(error);
  });

  it("throws anything that is not an API answer", async () => {
    const error = new SyntaxError("Unexpected end of JSON input");
    apiRequestMock.mockRejectedValue(error);

    await expect(syncCalendarChanges(changes, 7)).rejects.toBe(error);
  });
});
