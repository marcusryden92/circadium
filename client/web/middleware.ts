import { NextResponse } from "next/server";
import NextAuth from "next-auth";

import authConfig from "@/auth.config";
import {
  STAGING_GATE_CHALLENGE,
  isAllowedThroughStagingGate,
} from "@/lib/stagingGate";
import {
  DEFAULT_LOGIN_REDIRECT,
  apiAuthPrefix,
  authRoutes,
  publicRoutes,
} from "@/routes";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
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

  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix);
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isAuthRoute = authRoutes.includes(nextUrl.pathname);

  if (isApiAuthRoute) {
    return NextResponse.next();
  }

  if (isAuthRoute) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL(`/`, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|relay-cq|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
