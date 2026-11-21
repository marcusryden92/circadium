/**
 * @jest-environment node
 */
import { ApiError, NETWORK_ERROR, apiRequest } from "@/lib/api/client";
import { ensureFreshSession, refreshSession } from "@/lib/session/refresh";

jest.mock("../../../lib/session/refresh", () => ({
  ensureFreshSession: jest.fn(),
  refreshSession: jest.fn(),
}));

const ensureFreshMock = ensureFreshSession as jest.MockedFunction<
  typeof ensureFreshSession
>;
const refreshMock = refreshSession as jest.MockedFunction<typeof refreshSession>;
let fetchMock: jest.Mock;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  ensureFreshMock.mockResolvedValue(true);
});

describe("apiRequest", () => {
  it("posts JSON with cookies and returns the parsed body", async () => {
    fetchMock.mockResolvedValue(json(200, { status: "AUTHENTICATED" }));

    await expect(
      apiRequest("/auth/login", { body: { email: "a@b.c", client: "web" } }),
    ).resolves.toEqual({ status: "AUTHENTICATED" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@b.c", client: "web" }),
      }),
    );
  });

  it("resolves undefined for an empty response", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      apiRequest("/auth/logout", { method: "POST" }),
    ).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: undefined });
  });

  it("turns a ProblemDetail into an ApiError with its code", async () => {
    fetchMock.mockResolvedValue(
      json(400, {
        title: "Bad Request",
        status: 400,
        detail: "The link has expired.",
        code: "expired_token",
      }),
    );

    const error = await apiRequest("/auth/verify-email", {
      body: { token: "t" },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "expired_token",
      message: "The link has expired.",
    });
  });

  it("carries field errors and Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        title: "Bad Request",
        detail: "Invalid request content.",
        errors: { email: "must be a well-formed email address" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      json(429, { title: "Too Many Requests" }, { "Retry-After": "42" }),
    );

    await expect(apiRequest("/auth/register", { body: {} })).rejects.toMatchObject({
      fieldErrors: { email: "must be a well-formed email address" },
    });
    await expect(apiRequest("/auth/login", { body: {} })).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 42,
    });
  });

  it("survives an error body that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));

    await expect(apiRequest("/auth/me")).rejects.toMatchObject({
      status: 502,
      code: undefined,
    });
  });

  it("reports a request that got no response as a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(apiRequest("/auth/me")).rejects.toMatchObject({
      status: 0,
      code: NETWORK_ERROR,
    });
  });

  it("passes an abort through unchanged", async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException("aborted", "AbortError");
    fetchMock.mockRejectedValue(abort);

    await expect(
      apiRequest("/auth/me", { signal: controller.signal }),
    ).rejects.toBe(abort);
  });

  it("does not touch the session for public endpoints", async () => {
    fetchMock.mockResolvedValue(json(401, { detail: "Invalid email, password, or code." }));

    await expect(apiRequest("/auth/login", { body: {} })).rejects.toMatchObject({
      status: 401,
    });
    expect(ensureFreshMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("apiRequest for authenticated endpoints", () => {
  it("makes sure the session is fresh first", async () => {
    fetchMock.mockResolvedValue(json(202, { status: "CONFIRMATION_EMAIL_SENT" }));

    await apiRequest("/account/deletion", {
      body: { confirmEmail: "a@b.c" },
      authenticated: true,
    });

    expect(ensureFreshMock).toHaveBeenCalledTimes(1);
    expect(ensureFreshMock.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );
  });

  it("refreshes and retries once after a 401", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { userId: "user-1" }));
    refreshMock.mockResolvedValue("refreshed");

    await expect(apiRequest("/auth/me", { authenticated: true })).resolves.toEqual({
      userId: "user-1",
    });
    expect(refreshMock).toHaveBeenCalledWith({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up with the 401 when the refresh fails", async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    refreshMock.mockResolvedValue("signed-out");

    await expect(apiRequest("/auth/me", { authenticated: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on other errors", async () => {
    fetchMock.mockResolvedValue(json(403, { code: "bad_password" }));

    await expect(
      apiRequest("/account/deletion", { body: {}, authenticated: true }),
    ).rejects.toMatchObject({ status: 403, code: "bad_password" });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
