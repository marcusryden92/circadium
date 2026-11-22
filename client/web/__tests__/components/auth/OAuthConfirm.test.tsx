import { fireEvent, render, screen } from "@testing-library/react";

import { OAuthConfirm } from "@/components/auth/OAuthConfirm";
import { ApiError } from "@/lib/api/client";
import { confirmOAuthSignup } from "@/lib/api/auth";
import { startOAuthSignIn } from "@/lib/session/oauthSignIn";

let search = new URLSearchParams();

jest.mock("next/navigation", () => ({ useSearchParams: () => search }));
jest.mock("../../../components/auth/AuthForm.css", () =>
  new Proxy({}, { get: (_target, key) => String(key) }),
);
jest.mock("../../../components/auth/AuthCard", () => {
  const { createElement } = jest.requireActual("react");
  return {
    AuthCard: ({ title, children }: { title: string; children: unknown }) =>
      createElement("section", null, createElement("h2", null, title), children),
  };
});
jest.mock("../../../components/ui", () => {
  const { createElement } = jest.requireActual("react");
  return {
    Button: ({ children, ...props }: { children: unknown }) =>
      createElement("button", props, children),
  };
});
jest.mock("../../../lib/api/auth");
jest.mock("../../../lib/session/oauthSignIn", () => ({
  ...jest.requireActual("../../../lib/session/oauthSignIn"),
  startOAuthSignIn: jest.fn(),
}));

const confirmMock = confirmOAuthSignup as jest.MockedFunction<typeof confirmOAuthSignup>;
const startMock = startOAuthSignIn as jest.MockedFunction<typeof startOAuthSignIn>;
const TOKEN = "t".repeat(43);

beforeEach(() => {
  jest.clearAllMocks();
  search = new URLSearchParams({ token: TOKEN });
});

describe("OAuthConfirm", () => {
  it("creates nothing until the button is pressed", () => {
    render(<OAuthConfirm />);

    expect(confirmMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("confirms the link, then offers the provider's sign-in", async () => {
    confirmMock.mockResolvedValue({ provider: "microsoft" });
    startMock.mockResolvedValue(undefined);
    render(<OAuthConfirm />);

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Sign in with Microsoft again to start.",
    );
    expect(confirmMock).toHaveBeenCalledWith(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Microsoft" }));
    expect(startMock).toHaveBeenCalledWith("microsoft", null);
  });

  it("shows why Java refused the link", async () => {
    confirmMock.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "email_in_use",
        message: "This email address already has a Circadium account. Sign in to that account instead.",
      }),
    );
    render(<OAuthConfirm />);

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This email address already has a Circadium account.",
    );
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  it("explains a link without its token", () => {
    search = new URLSearchParams();

    render(<OAuthConfirm />);

    expect(screen.getByRole("alert")).toHaveTextContent("This link is missing its token.");
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });
});
