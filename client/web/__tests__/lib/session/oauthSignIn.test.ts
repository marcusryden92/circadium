/**
 * @jest-environment node
 */
import { createHash } from "node:crypto";

import { hardNavigate } from "@/lib/session/navigation";
import {
  challengeFor,
  createVerifier,
  enabledSignInProviders,
  startOAuthSignIn,
  takePendingOAuthSignIn,
} from "@/lib/session/oauthSignIn";

jest.mock("../../../lib/session/navigation", () => ({ hardNavigate: jest.fn() }));

const hardNavigateMock = hardNavigate as jest.MockedFunction<typeof hardNavigate>;
const PENDING_KEY = "circadium:oauth-sign-in";

/** The patterns Java's start filter and handoff endpoint enforce. */
const JAVA_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const JAVA_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

let store: Map<string, string>;

function installSessionStorage(overrides: Partial<Storage> = {}) {
  store = new Map();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    ...overrides,
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    value: storage,
    configurable: true,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  installSessionStorage();
});

describe("the PKCE pair", () => {
  it("matches the RFC 7636 example", async () => {
    await expect(
      challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes a fresh verifier in the shape Java accepts", () => {
    const first = createVerifier();
    const second = createVerifier();

    expect(first).toMatch(JAVA_VERIFIER);
    expect(first).toHaveLength(43);
    expect(second).not.toBe(first);
  });
});

describe("startOAuthSignIn", () => {
  it.each(["google", "microsoft", "apple"] as const)(
    "keeps the verifier in this tab and sends only its hash to %s",
    async (provider) => {
      await startOAuthSignIn(provider, "/calendar");

      const pending = JSON.parse(store.get(PENDING_KEY) ?? "null");
      expect(pending.provider).toBe(provider);
      expect(pending.callbackUrl).toBe("/calendar");
      expect(pending.verifier).toMatch(JAVA_VERIFIER);

      const target = new URL(hardNavigateMock.mock.calls[0][0]);
      expect(`${target.origin}${target.pathname}`).toBe(
        `http://localhost:8080/oauth2/authorization/${provider}`,
      );
      expect(target.searchParams.get("client")).toBe("web");
      const challenge = target.searchParams.get("challenge");
      expect(challenge).toMatch(JAVA_CHALLENGE);
      expect(challenge).toBe(
        createHash("sha256").update(pending.verifier).digest("base64url"),
      );
      expect(target.search).not.toContain(pending.verifier);
    },
  );

  it("does not leave the page when the verifier cannot be stored", async () => {
    installSessionStorage({
      setItem: () => {
        throw new Error("SecurityError");
      },
    });

    await expect(startOAuthSignIn("google", null)).rejects.toThrow(
      "SecurityError",
    );
    expect(hardNavigateMock).not.toHaveBeenCalled();
  });
});

describe("takePendingOAuthSignIn", () => {
  it("hands the sign-in over once", () => {
    store.set(
      PENDING_KEY,
      JSON.stringify({
        provider: "microsoft",
        verifier: "v".repeat(43),
        callbackUrl: "/library",
      }),
    );

    expect(takePendingOAuthSignIn()).toEqual({
      provider: "microsoft",
      verifier: "v".repeat(43),
      callbackUrl: "/library",
    });
    expect(takePendingOAuthSignIn()).toBeNull();
  });

  it.each([
    ["nothing stored", undefined],
    ["unparseable", "{"],
    ["no verifier", JSON.stringify({ provider: "google", callbackUrl: "/x" })],
    [
      "an unknown provider",
      JSON.stringify({ provider: "github", verifier: "v".repeat(43) }),
    ],
  ])("returns null for %s", (_label, raw) => {
    if (raw !== undefined) store.set(PENDING_KEY, raw);

    expect(takePendingOAuthSignIn()).toBeNull();
  });

  it("returns null when storage is blocked", () => {
    installSessionStorage({
      getItem: () => {
        throw new Error("SecurityError");
      },
    });

    expect(takePendingOAuthSignIn()).toBeNull();
  });
});

describe("enabledSignInProviders", () => {
  it.each([undefined, "", "  "])("offers all three when set to %p", (setting) => {
    expect(enabledSignInProviders(setting)).toEqual([
      "google",
      "microsoft",
      "apple",
    ]);
  });

  it("keeps the listed known providers in a fixed order", () => {
    expect(enabledSignInProviders(" apple , google,github")).toEqual([
      "google",
      "apple",
    ]);
  });
});
