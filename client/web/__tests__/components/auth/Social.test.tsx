import { fireEvent, render, screen } from "@testing-library/react";

import { Social } from "@/components/auth/Social";
import { startOAuthSignIn } from "@/lib/session/oauthSignIn";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ callbackUrl: "/calendar" }),
}));
jest.mock("../../../components/auth/AuthForm.css", () =>
  new Proxy({}, { get: (_target, key) => String(key) }),
);
jest.mock("../../../components/ui", () => {
  const { createElement } = jest.requireActual("react");
  return {
    Button: ({ children, ...props }: { children: unknown }) =>
      createElement("button", props, children),
  };
});
jest.mock("../../../lib/session/oauthSignIn", () => ({
  ...jest.requireActual("../../../lib/session/oauthSignIn"),
  startOAuthSignIn: jest.fn(),
}));

const startMock = startOAuthSignIn as jest.MockedFunction<typeof startOAuthSignIn>;
const ORIGINAL = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS;

afterEach(() => {
  jest.clearAllMocks();
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_OAUTH_PROVIDERS;
  else process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = ORIGINAL;
});

describe("Social", () => {
  it("shows one named button per offered provider", () => {
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "google,microsoft";

    render(<Social />);

    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")))
      .toEqual(["Continue with Google", "Continue with Microsoft"]);
  });

  it("starts the chosen provider's sign-in with the callback", () => {
    delete process.env.NEXT_PUBLIC_OAUTH_PROVIDERS;
    startMock.mockReturnValue(new Promise(() => {}));
    render(<Social />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Apple" }));

    expect(startMock).toHaveBeenCalledWith("apple", "/calendar");
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  });

  it("explains when this browser cannot start the sign-in", async () => {
    delete process.env.NEXT_PUBLIC_OAUTH_PROVIDERS;
    startMock.mockRejectedValue(new Error("SecurityError"));
    render(<Social />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Microsoft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Microsoft sign-in could not start in this browser.",
    );
  });
});
