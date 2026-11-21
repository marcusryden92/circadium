import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

import { ACCESS_TOKEN_AUDIENCE, apiUrl } from "@/lib/session/config";

// Imported by the edge middleware as well as the Node server, so nothing here
// may depend on Node-only modules.

export type AccessTokenClaims = {
  userId: string;
  role: string;
  sessionId: string;
  /** Seconds since the epoch, as the JWT carries it. */
  issuedAt: number;
  /** Seconds since the epoch. */
  expiresAt: number;
};

// Vercel and Fly clocks are NTP-synced; this only absorbs sub-second drift
// around `exp`.
const CLOCK_TOLERANCE_SECONDS = 5;

// Errors that mean "this token is not acceptable". Anything else (Java
// unreachable, a non-200 or malformed key set, a timeout) means the token could
// not be checked at all, which callers must not mistake for "signed out".
const REJECTED_TOKEN_ERRORS = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
];

let javaKeySet: JWTVerifyGetKey | undefined;

// jose caches the fetched key set for this module instance and refetches when a
// token names an unknown `kid`, which is how a key rotation on the Java side
// reaches the web without a redeploy.
function javaKeys(): JWTVerifyGetKey {
  javaKeySet ??= createRemoteJWKSet(
    new URL(`${apiUrl()}/.well-known/jwks.json`),
  );
  return javaKeySet;
}

/**
 * Checks an access token issued by the Java API: RS256 signature against the
 * API's published keys, issuer, audience and expiry. Returns null for a token
 * that fails any check. Throws only when the keys cannot be fetched.
 */
export async function verifyAccessToken(
  token: string,
  keys: JWTVerifyGetKey = javaKeys(),
): Promise<AccessTokenClaims | null> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      issuer: apiUrl(),
      audience: ACCESS_TOKEN_AUDIENCE,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ["sub", "iat", "exp"],
    }));
  } catch (error) {
    if (REJECTED_TOKEN_ERRORS.some((type) => error instanceof type)) {
      return null;
    }
    throw error;
  }

  const { sub, iat, exp, role, sid } = payload;
  if (
    typeof sub !== "string" ||
    typeof iat !== "number" ||
    typeof exp !== "number" ||
    typeof role !== "string" ||
    typeof sid !== "string"
  ) {
    return null;
  }
  return {
    userId: sub,
    role,
    sessionId: sid,
    issuedAt: iat,
    expiresAt: exp,
  };
}
