/**
 * @jest-environment node
 */
import { ApiError, NETWORK_ERROR } from "@/lib/api/client";
import { describeApiError } from "@/lib/api/errorMessage";

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>) {
  return new ApiError({ status: 400, message: "Detail from Java.", ...init });
}

describe("describeApiError", () => {
  it("passes Java's wording through", () => {
    expect(
      describeApiError(
        apiError({ code: "expired_token", message: "This link has expired. Request a new one." }),
      ),
    ).toBe("This link has expired. Request a new one.");
  });

  it("explains a missing connection", () => {
    expect(describeApiError(apiError({ status: 0, code: NETWORK_ERROR }))).toBe(
      "Could not reach the server. Check your connection and try again.",
    );
  });

  it.each([
    [1, "Too many attempts. Try again in 1 second."],
    [45, "Too many attempts. Try again in 45 seconds."],
    [60, "Too many attempts. Try again in 1 minute."],
    [61, "Too many attempts. Try again in 2 minutes."],
    [undefined, "Too many attempts. Try again later."],
  ])("says when to retry after a 429 (Retry-After %s)", (seconds, message) => {
    expect(describeApiError(apiError({ status: 429, retryAfterSeconds: seconds }))).toBe(
      message,
    );
  });

  it("hides server faults behind a plain sentence", () => {
    expect(
      describeApiError(apiError({ status: 500, message: "An unexpected error occurred." })),
    ).toBe("Something went wrong on our side. Try again in a moment.");
  });

  it("does not show Bean Validation's developer messages", () => {
    expect(
      describeApiError(
        apiError({ message: "Invalid request content.", fieldErrors: { email: "must be a well-formed email address" } }),
      ),
    ).toBe("Some of the details you entered were not accepted. Check them and try again.");
  });

  it("covers errors that are not from the API", () => {
    expect(describeApiError(new TypeError("boom"))).toBe("Something went wrong. Try again.");
  });
});
