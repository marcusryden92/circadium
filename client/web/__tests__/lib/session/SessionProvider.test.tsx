import { act, render, screen } from "@testing-library/react";

import { hardNavigate, reloadPage } from "@/lib/session/navigation";
import { onSessionEnded, startSessionKeeper } from "@/lib/session/refresh";
import type { Session } from "@/lib/session/session";
import {
  SessionProvider,
  loginUrlFor,
  useSession,
} from "@/lib/session/SessionProvider";

jest.mock("../../../lib/session/navigation", () => ({
  hardNavigate: jest.fn(),
  reloadPage: jest.fn(),
}));
jest.mock("../../../lib/session/refresh", () => ({
  onSessionEnded: jest.fn(),
  startSessionKeeper: jest.fn(),
}));

const onSessionEndedMock = onSessionEnded as jest.MockedFunction<typeof onSessionEnded>;
const startMock = startSessionKeeper as jest.MockedFunction<typeof startSessionKeeper>;
const stopMock = jest.fn();
const unsubscribeMock = jest.fn();

const SESSION: Session = {
  user: {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    role: "USER",
    isTwoFactorEnabled: false,
    isOAuth: false,
  },
  accessTokenExpiresAt: "2026-11-21T10:15:00.000Z",
};

function Probe() {
  const { data, status } = useSession();
  return <p>{`${status}:${data?.user.email ?? "none"}`}</p>;
}

function endedListener() {
  return onSessionEndedMock.mock.calls[0][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  startMock.mockReturnValue(stopMock);
  onSessionEndedMock.mockReturnValue(unsubscribeMock);
});

describe("SessionProvider", () => {
  it("exposes the server's session and keeps it alive", () => {
    render(
      <SessionProvider session={SESSION}>
        <Probe />
      </SessionProvider>,
    );

    expect(screen.getByText("authenticated:ada@example.com")).toBeInTheDocument();
    expect(startMock).toHaveBeenCalledWith({
      userId: "user-1",
      accessTokenExpiresAt: Date.parse("2026-11-21T10:15:00.000Z"),
    });
  });

  it("is signed out without a session, and starts nothing", () => {
    render(
      <SessionProvider session={null}>
        <Probe />
      </SessionProvider>,
    );

    expect(screen.getByText("unauthenticated:none")).toBeInTheDocument();
    expect(startMock).not.toHaveBeenCalled();
  });

  it("sends a tab whose session ended to the login page, to come back here", () => {
    window.history.pushState({}, "", "/items/abc?tab=schedule");
    render(<SessionProvider session={SESSION}>{null}</SessionProvider>);

    act(() => endedListener()("signed-out"));

    expect(hardNavigate).toHaveBeenCalledWith(
      "/auth/login?callbackUrl=%2Fitems%2Fabc%3Ftab%3Dschedule",
    );
  });

  it("reloads when another tab signed in as someone else", () => {
    render(<SessionProvider session={SESSION}>{null}</SessionProvider>);

    act(() => endedListener()("user-changed"));

    expect(reloadPage).toHaveBeenCalled();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("stops the keeper on unmount", () => {
    const { unmount } = render(
      <SessionProvider session={SESSION}>{null}</SessionProvider>,
    );

    unmount();

    expect(stopMock).toHaveBeenCalled();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it("restarts the keeper when a re-render brings a new expiry", () => {
    const { rerender } = render(
      <SessionProvider session={SESSION}>{null}</SessionProvider>,
    );

    rerender(
      <SessionProvider
        session={{ ...SESSION, accessTokenExpiresAt: "2026-11-21T10:30:00.000Z" }}
      >
        {null}
      </SessionProvider>,
    );

    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenLastCalledWith({
      userId: "user-1",
      accessTokenExpiresAt: Date.parse("2026-11-21T10:30:00.000Z"),
    });
  });
});

describe("loginUrlFor", () => {
  it("keeps the path and query as the callback", () => {
    expect(loginUrlFor({ pathname: "/calendar", search: "?date=2026-11-21" })).toBe(
      "/auth/login?callbackUrl=%2Fcalendar%3Fdate%3D2026-11-21",
    );
  });
});
