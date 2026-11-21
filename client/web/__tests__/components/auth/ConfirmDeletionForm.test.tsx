import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSearchParams } from "next/navigation";

import { ConfirmDeletionForm } from "@/components/auth/ConfirmDeletionForm";
import { ApiError } from "@/lib/api/client";
import { confirmAccountDeletion } from "@/lib/api/auth";
import { hardNavigate } from "@/lib/session/navigation";
import { forgetSession } from "@/lib/session/refresh";
import { useSession } from "@/lib/session/SessionProvider";
import { signOut } from "@/lib/session/signOut";

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
  };
});
jest.mock("../../../lib/theme", () => ({
  space: new Proxy({}, { get: () => "8px" }),
}));
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
jest.mock("../../../lib/session/refresh", () => ({ forgetSession: jest.fn() }));
jest.mock("../../../lib/session/signOut", () => ({ signOut: jest.fn() }));
jest.mock("../../../lib/session/SessionProvider", () => ({
  ...jest.requireActual("../../../lib/session/SessionProvider"),
  useSession: jest.fn(),
}));

const confirmMock = confirmAccountDeletion as jest.MockedFunction<typeof confirmAccountDeletion>;
const signOutMock = signOut as jest.MockedFunction<typeof signOut>;
const useSessionMock = useSession as jest.Mock;

function renderWith(status: "authenticated" | "unauthenticated", token: string | null = "tok-1") {
  (useSearchParams as jest.Mock).mockReturnValue(
    new URLSearchParams(token ? { token } : {}),
  );
  useSessionMock.mockReturnValue({ status, data: null });
  return render(<ConfirmDeletionForm />);
}

beforeEach(() => jest.clearAllMocks());

describe("ConfirmDeletionForm", () => {
  it("deletes, then signs out to the home page", async () => {
    confirmMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue(undefined);
    renderWith("authenticated");

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/" }));
    expect(confirmMock).toHaveBeenCalledWith("tok-1");
    expect(screen.getByRole("status")).toHaveTextContent("Account deleted.");
  });

  it("still leaves when the sign-out call fails after a deletion", async () => {
    confirmMock.mockResolvedValue(undefined);
    signOutMock.mockRejectedValue(new ApiError({ status: 0, message: "offline" }));
    renderWith("authenticated");

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/"));
    expect(forgetSession).toHaveBeenCalled();
  });

  it("asks a signed-out visitor to sign in and come back to this link", () => {
    renderWith("unauthenticated");

    expect(screen.getByRole("alert")).toHaveTextContent("Sign in with the account you want to delete");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/login?callbackUrl=%2Fauth%2Fconfirm-deletion%3Ftoken%3Dtok-1",
    );
    expect(screen.queryByRole("button", { name: "Delete my account" })).toBeNull();
  });

  it("asks to sign in when the session ran out", async () => {
    confirmMock.mockRejectedValue(new ApiError({ status: 401, message: "Unauthorized" }));
    renderWith("authenticated");

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign in with the account you want to delete",
    );
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("shows Java's reason for refusing the link", async () => {
    confirmMock.mockRejectedValue(
      new ApiError({
        status: 403,
        code: "wrong_account",
        message:
          "This confirmation link belongs to a different account. Sign in as that account to confirm.",
      }),
    );
    renderWith("authenticated");

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This confirmation link belongs to a different account.",
    );
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
