import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  exchangeCodeForTokens,
  microsoftCallbackUri,
  MICROSOFT_OAUTH_STATE_COOKIE,
} from "@/utils/external-calendar/microsoftGraphApi";

function settingsRedirect(result: "connected" | "error"): NextResponse {
  return NextResponse.redirect(
    new URL(`/settings?microsoft=${result}`, process.env.NEXT_PUBLIC_APP_URL),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL));
  }
  const userId = session.user.id;

  const cookieStore = cookies();
  const expectedState = cookieStore.get(MICROSOFT_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(MICROSOFT_OAUTH_STATE_COOKIE);

  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !state || !expectedState || state !== expectedState) {
    return settingsRedirect("error");
  }

  try {
    const { refreshToken, email } = await exchangeCodeForTokens(
      code,
      microsoftCallbackUri(),
    );
    // A re-connect replaces the grant. Microsoft has no revoke endpoint for
    // consumer grants; the superseded refresh token ages out on its own.
    await db.microsoftCalendarConnection.upsert({
      where: { userId },
      update: { refreshToken, email },
      create: { userId, refreshToken, email },
    });
    return settingsRedirect("connected");
  } catch (error) {
    console.error("Microsoft Calendar connect failed:", error);
    return settingsRedirect("error");
  }
}
