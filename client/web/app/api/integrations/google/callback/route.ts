import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  exchangeCodeForTokens,
  googleCallbackUri,
  revokeGoogleToken,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/utils/external-calendar/googleCalendarApi";

function settingsRedirect(result: "connected" | "error"): NextResponse {
  return NextResponse.redirect(
    new URL(`/settings?google=${result}`, process.env.NEXT_PUBLIC_APP_URL),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL));
  }
  const userId = session.user.id;

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE);

  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !state || !expectedState || state !== expectedState) {
    return settingsRedirect("error");
  }

  try {
    const { refreshToken, email } = await exchangeCodeForTokens(
      code,
      googleCallbackUri(),
    );
    // A re-connect replaces the grant; revoke the old one so it doesn't
    // linger authorized on the Google side.
    const existing = await db.googleCalendarConnection.findUnique({
      where: { userId },
    });
    if (existing) await revokeGoogleToken(existing.refreshToken);
    await db.googleCalendarConnection.upsert({
      where: { userId },
      update: { refreshToken, email },
      create: { userId, refreshToken, email },
    });
    return settingsRedirect("connected");
  } catch (error) {
    console.error("Google Calendar connect failed:", error);
    return settingsRedirect("error");
  }
}
