import { NextResponse, type NextRequest } from "next/server";

import { verifyAccessToken } from "@/lib/session/accessToken";
import { accessCookieName } from "@/lib/session/config";
import {
  STAGING_GATE_CHALLENGE,
  isAllowedThroughStagingGate,
} from "@/lib/stagingGate";
import { authRoutes, publicRoutes } from "@/routes";

// The edge runtime has no database, so this checks only what the token itself
// proves: signature, issuer, audience, expiry. getSession() adds the account
// checks (deleted account, token older than the last password change) on every
// server render and server action.
export default async function middleware(req: NextRequest) {
  if (
    !isAllowedThroughStagingGate(
      req.headers.get("authorization"),
      process.env.STAGING_PASSWORD,
    )
  ) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": STAGING_GATE_CHALLENGE },
    });
  }

  const { pathname, search } = req.nextUrl;
  // Sign-in pages stay open to a request carrying a token. A token can pass
  // here and still be refused by the server (see above), and sending such a
  // visitor from the login page back into the app would loop. The login page
  // forwards visitors who really are signed in.
  if (publicRoutes.includes(pathname) || authRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(accessCookieName())?.value;
  if (token) {
    let claims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      // Java's signing keys could not be fetched, so the token cannot be
      // judged either way. Turning the visitor away as signed out would send
      // them to a login that cannot work either.
      return new NextResponse(
        "Circadium cannot check your sign-in right now. Try again in a minute.",
        {
          status: 503,
          headers: { "Retry-After": "30", "Cache-Control": "no-store" },
        },
      );
    }
    if (claims) return NextResponse.next();
  }

  // No cookie usually means the access token expired (the browser drops the
  // cookie with it); the login page first tries a silent refresh.
  const login = new URL("/auth/login", req.nextUrl);
  login.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next|relay-cq|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
