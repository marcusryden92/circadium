import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";

import { OAuthComplete } from "@/components/auth/OAuthComplete";
import { ApiError } from "@/lib/api/client";
import { redeemOAuthSignIn } from "@/lib/api/auth";
import { hardNavigate } from "@/lib/session/navigation";

jest.mock("../../../components/auth/AuthForm.css", () =>
  new Proxy({}, { get: (_target, key) => String(key) }),
);
jest.mock("../../../components/auth/AuthCard", () => {
  const { createElement } = jest.requireActual("react");
  return {
    AuthCard: ({
      title,
      children,
      altAction,
    }: {
      title: string;
      children: unknown;
      altAction?: { label: string; href: string };
    }) =>
      createElement(
        "section",
        null,
        createElement("h2", null, title),
        children,
        altAction && createElement("a", { href: altAction.href }, altAction.label),
      ),
  };
});
jest.mock("../../../components/ui", () => {
  const { createElement } = jest.requireActual("react");
  return { Loader: ({ label }: { label: string }) => createElement("span", null, label) };
});
jest.mock("../../../lib/api/auth");
jest.mock("../../../lib/session/navigation", () => ({ hardNavigate: jest.fn() }));

const redeemMock = redeemOAuthSignIn as jest.MockedFunction<typeof redeemOAuthSignIn>;
const PENDING_KEY = "circadium:oauth-sign-in";
const CODE = "c".repeat(43);
const VERIFIER = "v".repeat(43);

function arriveWith(
  query: string,
  pending?: { provider?: string; verifier: string; callbackUrl: string | null },
) {
  window.history.replaceState(null, "", `/auth/oauth/complete?${query}`);
  if (pending) {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ provider: "google", ...pending }),
    );
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

describe("OAuthComplete", () => {
  it("redeems the code once with this tab's verifier, then loads the callback", async () => {
    redeemMock.mockResolvedValue(undefined);
    arriveWith(`code=${CODE}`, { verifier: VERIFIER, callbackUrl: "/calendar" });

    render(
      <StrictMode>
        <OAuthComplete />
      </StrictMode>,
    );

    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/calendar"));
    expect(redeemMock).toHaveBeenCalledTimes(1);
    expect(redeemMock).toHaveBeenCalledWith({ code: CODE, verifier: VERIFIER });
    // A second effect run would find the URL already cleaned and report a
    // failed sign-in over the one that is completing.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("takes the code out of the address bar and the verifier out of storage", () => {
    redeemMock.mockReturnValue(new Promise(() => {}));
    arriveWith(`code=${CODE}`, { verifier: VERIFIER, callbackUrl: null });

    render(<OAuthComplete />);

    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/auth/oauth/complete");
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("never follows a callback off the site", async () => {
    redeemMock.mockResolvedValue(undefined);
    arriveWith(`code=${CODE}`, { verifier: VERIFIER, callbackUrl: "//evil.example" });

    render(<OAuthComplete />);

    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/dashboard"));
  });

  it.each([
    ["account_exists", "google", "This email already has a Circadium account. Sign in the way you signed up"],
    ["email_missing", "apple", "Apple did not share an email address"],
    ["access_denied", "microsoft", "Microsoft sign-in was cancelled."],
    ["oauth_failed", "google", "Google sign-in did not work. Try again."],
    ["anything_else", "apple", "Apple sign-in did not work. Try again."],
  ])("explains error=%s from %s without redeeming anything", async (code, provider, message) => {
    arriveWith(`error=${code}`, { provider, verifier: VERIFIER, callbackUrl: "/library" });

    render(<OAuthComplete />);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(redeemMock).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/auth/login?callbackUrl=%2Flibrary",
    );
  });

  it("names no provider when this tab has no sign-in to go by", async () => {
    arriveWith("error=access_denied");

    render(<OAuthComplete />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The sign-in was cancelled.");
  });

  it("sends a first Microsoft sign-in to its inbox without redeeming anything", async () => {
    arriveWith("status=verification_sent", {
      provider: "microsoft",
      verifier: VERIFIER,
      callbackUrl: null,
    });

    render(<OAuthComplete />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Check the inbox of the email address on your Microsoft account",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(redeemMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("refuses to finish a sign-in this tab did not start", async () => {
    arriveWith(`code=${CODE}`);

    render(<OAuthComplete />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This sign-in was started in another tab or window.",
    );
    expect(redeemMock).not.toHaveBeenCalled();
  });

  it("shows why Java refused the code", async () => {
    redeemMock.mockRejectedValue(
      new ApiError({
        status: 400,
        code: "invalid_code",
        message: "This sign-in has expired or was already used. Sign in again.",
      }),
    );
    arriveWith(`code=${CODE}`, { verifier: VERIFIER, callbackUrl: null });

    render(<OAuthComplete />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This sign-in has expired or was already used. Sign in again.",
    );
    expect(hardNavigate).not.toHaveBeenCalled();
  });
});
