import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import {
  microsoftAuthUrl,
  microsoftCallbackUri,
  MICROSOFT_OAUTH_STATE_COOKIE,
} from "@/utils/external-calendar/microsoftGraphApi";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL));
  }

  const state = randomBytes(16).toString("hex");
  cookies().set(MICROSOFT_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(microsoftAuthUrl(microsoftCallbackUri(), state));
}
