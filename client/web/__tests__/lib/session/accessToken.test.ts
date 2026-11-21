/**
 * @jest-environment node
 */
import {
  SignJWT,
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
  type JWTVerifyGetKey,
} from "jose";

import { verifyAccessToken } from "@/lib/session/accessToken";

const ISSUER = "http://localhost:8080";
const AUDIENCE = "circadium-api";
const KID = "test-key";

let privateKey: CryptoKey;
let publicJwk: JWK;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256" };
  keys = createLocalJWKSet({ keys: [publicJwk] });
});

type TokenOptions = {
  issuer?: string;
  audience?: string;
  expiresIn?: string | number;
  issuedAt?: number;
  claims?: Record<string, unknown>;
  kid?: string;
  key?: CryptoKey;
};

async function sign(options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    role: "USER",
    sid: "family-1",
    ...options.claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: options.kid ?? KID })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setSubject("user-1")
    .setIssuedAt(options.issuedAt ?? now)
    .setExpirationTime(options.expiresIn ?? "15m")
    .sign(options.key ?? privateKey);
}

describe("verifyAccessToken", () => {
  it("returns the claims of a valid token", async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 60;
    const token = await sign({ issuedAt, expiresIn: issuedAt + 900 });

    await expect(verifyAccessToken(token, keys)).resolves.toEqual({
      userId: "user-1",
      role: "USER",
      sessionId: "family-1",
      issuedAt,
      expiresAt: issuedAt + 900,
      twoFactorVerified: false,
    });
  });

  it("reads a two-factor sign-in from Java's amr claim, and only from mfa", async () => {
    const verified = await sign({ claims: { amr: ["pwd", "otp", "mfa"] } });
    const passwordOnly = await sign({ claims: { amr: ["pwd"] } });
    const malformed = await sign({ claims: { amr: "mfa" } });

    await expect(verifyAccessToken(verified, keys)).resolves.toMatchObject({
      twoFactorVerified: true,
    });
    await expect(verifyAccessToken(passwordOnly, keys)).resolves.toMatchObject({
      twoFactorVerified: false,
    });
    await expect(verifyAccessToken(malformed, keys)).resolves.toMatchObject({
      twoFactorVerified: false,
    });
  });

  it("rejects an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = await sign({ issuedAt: past, expiresIn: past + 900 });

    await expect(verifyAccessToken(token, keys)).resolves.toBeNull();
  });

  it("rejects a token from another issuer", async () => {
    const token = await sign({ issuer: "https://api.circadium.app" });

    await expect(verifyAccessToken(token, keys)).resolves.toBeNull();
  });

  it("rejects a token for another audience", async () => {
    const token = await sign({ audience: "someone-else" });

    await expect(verifyAccessToken(token, keys)).resolves.toBeNull();
  });

  it("rejects a token signed by a key that is not Java's", async () => {
    const forger = await generateKeyPair("RS256");
    const token = await sign({ key: forger.privateKey });

    await expect(verifyAccessToken(token, keys)).resolves.toBeNull();
  });

  it("rejects a token naming an unknown key id", async () => {
    const token = await sign({ kid: "retired-key" });

    await expect(verifyAccessToken(token, keys)).resolves.toBeNull();
  });

  it("rejects an HS256 token, so the public key cannot double as an HMAC secret", async () => {
    const secret = new TextEncoder().encode(JSON.stringify(publicJwk));
    const token = await new SignJWT({ role: "ADMIN", sid: "x" })
      .setProtectedHeader({ alg: "HS256", kid: KID })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secret);

    await expect(verifyAccessToken(token, keys)).resolves.toBeNull();
  });

  it("rejects a token without the role or session claims", async () => {
    const noRole = await sign({ claims: { role: undefined } });
    const noSession = await sign({ claims: { sid: undefined } });

    await expect(verifyAccessToken(noRole, keys)).resolves.toBeNull();
    await expect(verifyAccessToken(noSession, keys)).resolves.toBeNull();
  });

  it("rejects garbage", async () => {
    await expect(verifyAccessToken("not-a-jwt", keys)).resolves.toBeNull();
    await expect(verifyAccessToken("", keys)).resolves.toBeNull();
  });

  it.each([
    ["a key set timeout", new errors.JWKSTimeout()],
    [
      "a non-200 key set response",
      new errors.JOSEError(
        "Expected 200 OK from the JSON Web Key Set HTTP response",
      ),
    ],
    ["a network failure", new TypeError("fetch failed")],
  ])("throws on %s instead of reporting signed out", async (_, failure) => {
    const token = await sign();
    const unavailable: JWTVerifyGetKey = async () => {
      throw failure;
    };

    await expect(verifyAccessToken(token, unavailable)).rejects.toBe(failure);
  });
});

describe("verifyAccessToken against the remote key set", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.resetModules();
  });

  async function freshModule() {
    let mod!: typeof import("@/lib/session/accessToken");
    await jest.isolateModulesAsync(async () => {
      mod = await import("@/lib/session/accessToken");
    });
    return mod;
  }

  it("fetches Java's published keys from the API origin", async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const { verifyAccessToken: verify } = await freshModule();

    await expect(verify(await sign())).resolves.toMatchObject({
      userId: "user-1",
    });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
      "http://localhost:8080/.well-known/jwks.json",
    );
  });

  it("throws when the key set endpoint answers 503", async () => {
    global.fetch = jest.fn(
      async () => new Response("unavailable", { status: 503 }),
    ) as unknown as typeof fetch;
    const { verifyAccessToken: verify } = await freshModule();

    // The isolated module has its own copy of jose, so match on the code
    // rather than on the error class.
    await expect(verify(await sign())).rejects.toMatchObject({
      code: "ERR_JOSE_GENERIC",
    });
  });
});
