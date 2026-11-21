/**
 * Password gate for the staging deployment: HTTP Basic auth in front of every
 * route whenever STAGING_PASSWORD is set. Only the staging Vercel project sets
 * it, so production never sees the gate. Basic auth rather than a login page
 * because the browser asks once and then resends the credentials on every
 * same-origin request, emailed links and OAuth callbacks included. The
 * username is ignored.
 */
export const STAGING_GATE_CHALLENGE =
  'Basic realm="Circadium staging", charset="UTF-8"';

export const isAllowedThroughStagingGate = (
  authorization: string | null,
  password: string | undefined,
): boolean => {
  if (!password) return true;
  if (!authorization?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = atob(authorization.slice("Basic ".length).trim());
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;

  return constantTimeEqual(decoded.slice(separator + 1), toUtf8Binary(password));
};

// atob yields one character per byte, and browsers send UTF-8 bytes under
// charset="UTF-8", so the password is compared in the same byte form.
const toUtf8Binary = (value: string) =>
  encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

const constantTimeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
};
