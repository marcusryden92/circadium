import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSearchParams } from "next/navigation";

import { NewPasswordForm } from "@/components/auth/NewPasswordForm";
import { NewVerificationForm } from "@/components/auth/NewVerificationForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { ResetForm } from "@/components/auth/ResetForm";
import { ApiError } from "@/lib/api/client";
import {
  register,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "@/lib/api/auth";

jest.mock("../../../components/auth/AuthForm.css", () =>
  new Proxy({}, { get: (_target, key) => String(key) }),
);
jest.mock("../../../components/auth/AuthCard", () => {
  const { createElement } = jest.requireActual("react");
  return {
    AuthCard: ({ children }: { children: unknown }) => createElement("section", null, children),
  };
});
jest.mock("../../../components/ui", () => {
  const { createElement } = jest.requireActual("react");
  return {
    Button: ({ children, variant: _v, size: _s, ...rest }: Record<string, unknown>) =>
      createElement("button", rest, children),
    Loader: ({ label }: { label: string }) => createElement("span", null, label),
  };
});
jest.mock("next/navigation", () => ({ useSearchParams: jest.fn() }));
jest.mock("../../../lib/api/auth");

const registerMock = register as jest.MockedFunction<typeof register>;
const resetRequestMock = requestPasswordReset as jest.MockedFunction<typeof requestPasswordReset>;
const resetPasswordMock = resetPassword as jest.MockedFunction<typeof resetPassword>;
const verifyEmailMock = verifyEmail as jest.MockedFunction<typeof verifyEmail>;

function withQuery(query: Record<string, string>) {
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(query));
}

function type(labelText: string, value: string) {
  fireEvent.change(screen.getByLabelText(labelText), { target: { value } });
}

beforeEach(() => jest.clearAllMocks());

describe("RegisterForm", () => {
  function fill(password: string) {
    type("Name", "Ada");
    type("Email", "ada@example.com");
    type("Password", password);
    type("Confirm", password);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  }

  it("sends the account, not the confirmation field, and words the answer for both cases", async () => {
    registerMock.mockResolvedValue(undefined);
    render(<RegisterForm />);

    fill("correct horse");

    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith({
        name: "Ada",
        email: "ada@example.com",
        password: "correct horse",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "We sent an email to ada@example.com.",
    );
  });

  it.each([
    ["shorter than 8 characters", "short12", "At least 8 characters."],
    ["over bcrypt's 72 bytes", "é".repeat(37), "Too long: at most 72 characters"],
  ])("refuses a password %s before sending it", async (_label, password, message) => {
    render(<RegisterForm />);

    fill(password);

    expect(await screen.findByText(message, { exact: false })).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();
  });
});

describe("ResetForm", () => {
  it("answers the same whether or not the account exists", async () => {
    resetRequestMock.mockResolvedValue(undefined);
    render(<ResetForm />);

    type("Email", "ada@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(resetRequestMock).toHaveBeenCalledWith("ada@example.com"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If ada@example.com signs in with a password, we sent it a reset link.",
    );
  });
});

describe("NewPasswordForm", () => {
  function fill(password: string) {
    type("New password", password);
    type("Confirm", password);
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  }

  it("sets the password with the link's token", async () => {
    resetPasswordMock.mockResolvedValue(undefined);
    withQuery({ token: "reset-1" });
    render(<NewPasswordForm />);

    fill("correct horse");

    await waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith({
        token: "reset-1",
        password: "correct horse",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Password updated");
  });

  it("explains an expired link", async () => {
    resetPasswordMock.mockRejectedValue(
      new ApiError({
        status: 400,
        code: "expired_token",
        message: "This link has expired. Request a new one.",
      }),
    );
    withQuery({ token: "reset-1" });
    render(<NewPasswordForm />);

    fill("correct horse");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link has expired. Request a new one.",
    );
  });

  it("does not send without a token", async () => {
    withQuery({});
    render(<NewPasswordForm />);

    fill("correct horse");

    expect(await screen.findByRole("alert")).toHaveTextContent("missing its token");
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });
});

describe("NewVerificationForm", () => {
  it("spends the one-time token once, even when React runs effects twice", async () => {
    verifyEmailMock.mockResolvedValue(undefined);
    withQuery({ token: "verify-1" });

    render(
      <StrictMode>
        <NewVerificationForm />
      </StrictMode>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your email address is confirmed.",
    );
    expect(verifyEmailMock).toHaveBeenCalledTimes(1);
    expect(verifyEmailMock).toHaveBeenCalledWith("verify-1");
  });

  it("explains a link that was already used", async () => {
    verifyEmailMock.mockRejectedValue(
      new ApiError({
        status: 400,
        code: "invalid_token",
        message: "This link is invalid or has already been used.",
      }),
    );
    withQuery({ token: "verify-1" });

    render(<NewVerificationForm />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link is invalid or has already been used.",
    );
  });
});
