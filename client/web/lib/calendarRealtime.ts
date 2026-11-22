import { apiUrl } from "@/lib/session/config";

// Realtime (WebSocket) catch-up for the calendar, gated separately from the
// transport so it can ship dark and flip by env like NEXT_PUBLIC_CALENDAR_BACKEND.
// "on" opens a WebSocket to the Java API that pushes dataVersion changes to a
// user's other sessions; unset keeps the HTTP sync loop as the only channel, so
// removing it rolls back to exactly today. Inlined at build time — a change
// needs a redeploy. Only meaningful with NEXT_PUBLIC_CALENDAR_BACKEND=java.
export function calendarRealtimeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CALENDAR_REALTIME === "on";
}

// The wss:// URL of the realtime endpoint, derived from the Java API origin so
// it follows the same per-environment default as every other API call.
export function calendarRealtimeUrl(): string {
  const url = new URL("/ws", apiUrl());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
