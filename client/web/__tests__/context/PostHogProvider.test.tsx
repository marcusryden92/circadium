import { render } from "@testing-library/react";
import posthog from "posthog-js";

import PostHogProvider from "@/context/PostHogProvider";
import { useSession } from "@/lib/session/SessionProvider";

jest.mock("posthog-js", () => ({
  __esModule: true,
  default: { identify: jest.fn(), reset: jest.fn(), get_property: jest.fn() },
}));
jest.mock("../../lib/session/SessionProvider", () => ({ useSession: jest.fn() }));

const useSessionMock = useSession as jest.Mock;
const posthogMock = posthog as jest.Mocked<typeof posthog>;

function signedIn() {
  useSessionMock.mockReturnValue({
    status: "authenticated",
    data: { user: { id: "user-1", email: "ada@example.com", name: "Ada" } },
  });
}

function signedOut() {
  useSessionMock.mockReturnValue({ status: "unauthenticated", data: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
});

describe("PostHogProvider", () => {
  it("identifies the signed-in user", () => {
    signedIn();

    render(<PostHogProvider>page</PostHogProvider>);

    expect(posthogMock.identify).toHaveBeenCalledWith("user-1", {
      email: "ada@example.com",
      name: "Ada",
    });
    expect(posthogMock.reset).not.toHaveBeenCalled();
  });

  it("drops the previous user's identity on a signed-out page", () => {
    signedOut();
    posthogMock.get_property.mockReturnValue("identified");

    render(<PostHogProvider>page</PostHogProvider>);

    expect(posthogMock.get_property).toHaveBeenCalledWith("$user_state");
    expect(posthogMock.reset).toHaveBeenCalledTimes(1);
  });

  it("keeps an anonymous visitor's id, so their visit stays one person", () => {
    signedOut();
    posthogMock.get_property.mockReturnValue("anonymous");

    render(<PostHogProvider>page</PostHogProvider>);

    expect(posthogMock.reset).not.toHaveBeenCalled();
    expect(posthogMock.identify).not.toHaveBeenCalled();
  });

  it("does nothing when analytics is not configured", () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    signedIn();

    render(<PostHogProvider>page</PostHogProvider>);

    expect(posthogMock.identify).not.toHaveBeenCalled();
  });
});
