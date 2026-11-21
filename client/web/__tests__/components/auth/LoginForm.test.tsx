import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSearchParams } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { ApiError } from "@/lib/api/client";
import { signInWithPassword, verifyTwoFactorCode } from "@/lib/api/auth";
import { hardNavigate } from "@/lib/session/navigation";
import { hasRememberedSession, refreshSession } from "@/lib/session/refresh";
import { useSession } from "@/lib/session/SessionProvider";

// Vanilla Extract styles only compile inside the Next build, so the styled
// leaves are swapped for plain elements.
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
  const { createElement, forwardRef } = jest.requireActual("react");
  return {
    Button: ({ children, variant: _v, size: _s, ...rest }: Record<string, unknown>) =>
      createElement("button", rest, children),
    PasswordInput: forwardRef(
      ({ variant: _v, ...rest }: Record<string, unknown>, ref: unknown) =>
        createElement("input", { ...rest, type: "password", ref }),
    ),
  };
});
jest.mock("next/link", () => {
  const { createElement } = jest.requireActual("react");
  return {
    __esModule: true,
    default: ({ href, children, ...rest }: Record<string, unknown>) =>
      createElement("a", { href, ...rest }, children),
  };
});
jest.mock("next/navigation", () => ({ useSearchParams: jest.fn() }));
jest.mock("../../../lib/api/auth");
jest.mock("../../../lib/session/navigation", () => ({ hardNavigate: jest.fn() }));
jest.mock("../../../lib/session/refresh", () => ({
  hasRememberedSession: jest.fn(),
  refreshSession: jest.fn(),
}));
jest.mock("../../../lib/session/SessionProvider", () => ({
  useSession: jest.fn(),
}));

const useSearchParamsMock = useSearchParams as jest.Mock;
const signInMock = signInWithPassword as jest.MockedFunction<typeof signInWithPassword>;
const verifyMock = verifyTwoFactorCode as jest.MockedFunction<typeof verifyTwoFactorCode>;
const rememberedMock = hasRememberedSession as jest.MockedFunction<typeof hasRememberedSession>;
const refreshMock = refreshSession as jest.MockedFunction<typeof refreshSession>;
const useSessionMock = useSession as jest.Mock;

function renderAt(query = "") {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(query));
  return render(<LoginForm />);
}

function type(labelText: string, value: string) {
  fireEvent.change(screen.getByLabelText(labelText), { target: { value } });
}

async function submitPassword() {
  type("Email", "ada@example.com");
  type("Password", "secret");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(signInMock).toHaveBeenCalled());
}

// The result of a step (the code field, an error) renders one commit before
// the transition ends and re-enables the button; clicking in between does
// nothing, which shows up under a loaded test run.
async function settled(buttonName: string) {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: buttonName })).toBeEnabled(),
  );
}

async function reachCodeStep() {
  signInMock.mockResolvedValueOnce("two-factor-required");
  await submitPassword();
  await screen.findByLabelText("Code");
  await settled("Verify");
}

beforeEach(() => {
  jest.clearAllMocks();
  rememberedMock.mockReturnValue(false);
  useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
});

describe("LoginForm, for a visitor who may already be signed in", () => {
  it("sends a signed-in visitor on without asking for anything", async () => {
    useSessionMock.mockReturnValue({ data: {}, status: "authenticated" });
    renderAt("callbackUrl=%2Fcalendar");

    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/calendar"));
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("renews an expired access cookie with the refresh cookie, then goes back", async () => {
    rememberedMock.mockReturnValue(true);
    refreshMock.mockResolvedValue("refreshed");
    renderAt("callbackUrl=%2Fsettings");

    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/settings"));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("shows the form, disabled, while the refresh is out", async () => {
    rememberedMock.mockReturnValue(true);
    let finish: (outcome: "signed-out") => void = () => {};
    refreshMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderAt();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Signing you back in...",
    );
    expect(screen.getByLabelText("Email")).toBeDisabled();

    finish("signed-out");
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeEnabled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it.each(["signed-out", "unavailable"] as const)(
    "asks for the password when the refresh comes back %s",
    async (outcome) => {
      rememberedMock.mockReturnValue(true);
      refreshMock.mockResolvedValue(outcome);
      renderAt();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled(),
      );
      expect(hardNavigate).not.toHaveBeenCalled();
    },
  );

  it("does not try a refresh in a browser that holds no session", () => {
    renderAt();

    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});

describe("LoginForm", () => {
  it("signs in and loads the page the user was sent from", async () => {
    signInMock.mockResolvedValue("signed-in");
    renderAt("callbackUrl=%2Fcalendar%3Fdate%3D2026-11-21");

    await submitPassword();

    expect(signInMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "secret",
    });
    await waitFor(() =>
      expect(hardNavigate).toHaveBeenCalledWith("/calendar?date=2026-11-21"),
    );
  });

  it("ignores a callback that leaves the site", async () => {
    signInMock.mockResolvedValue("signed-in");
    renderAt("callbackUrl=https%3A%2F%2Fevil.example%2F");

    await submitPassword();

    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/dashboard"));
  });

  it("asks for the emailed code, and sends it with the same password", async () => {
    renderAt();
    await reachCodeStep();
    expect(screen.getByRole("status")).toHaveTextContent(
      "We emailed you a 6-digit code. It expires in 5 minutes.",
    );

    verifyMock.mockResolvedValue("signed-in");
    type("Code", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(verifyMock).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "secret",
        code: "123456",
      }),
    );
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/dashboard"));
  });

  it("keeps the password through a wrong code", async () => {
    renderAt();
    await reachCodeStep();

    verifyMock.mockRejectedValueOnce(
      new ApiError({ status: 401, message: "Invalid email, password, or code." }),
    );
    type("Code", "111111");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code is wrong or has expired.",
    );
    await settled("Verify");

    verifyMock.mockResolvedValueOnce("signed-in");
    type("Code", "222222");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(verifyMock).toHaveBeenLastCalledWith({
        email: "ada@example.com",
        password: "secret",
        code: "222222",
      }),
    );
  });

  it("checks the code's shape before sending it", async () => {
    renderAt();
    await reachCodeStep();

    type("Code", "12a4");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(
      await screen.findByText("Enter the 6-digit code from the email."),
    ).toBeInTheDocument();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("sends a new code by signing in again", async () => {
    renderAt();
    await reachCodeStep();

    signInMock.mockResolvedValueOnce("two-factor-required");
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(2));
    expect(signInMock).toHaveBeenLastCalledWith({
      email: "ada@example.com",
      password: "secret",
    });
  });

  it("says the credentials are wrong without naming which", async () => {
    signInMock.mockRejectedValue(
      new ApiError({ status: 401, message: "Invalid email, password, or code." }),
    );
    renderAt();

    await submitPassword();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password.",
    );
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("says when a locked account can try again", async () => {
    signInMock.mockRejectedValue(
      new ApiError({ status: 429, message: "Too many failed attempts.", retryAfterSeconds: 120 }),
    );
    renderAt();

    await submitPassword();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Try again in 2 minutes.",
    );
  });

  it("tells an unverified account to check its email", async () => {
    signInMock.mockResolvedValue("verification-sent");
    renderAt();

    await submitPassword();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Confirm your email first: we sent you a new link.",
    );
    expect(hardNavigate).not.toHaveBeenCalled();
  });
});
