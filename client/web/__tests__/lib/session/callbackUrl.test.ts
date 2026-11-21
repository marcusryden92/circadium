/**
 * @jest-environment node
 */
import { safeCallbackUrl } from "@/lib/session/callbackUrl";

const ORIGIN = "https://staging.circadium.app";

describe("safeCallbackUrl", () => {
  it.each([
    ["/calendar", "/calendar"],
    ["/items/abc?tab=schedule#notes", "/items/abc?tab=schedule#notes"],
    [`${ORIGIN}/library`, "/library"],
    ["/auth/confirm-deletion?token=t1", "/auth/confirm-deletion?token=t1"],
  ])("keeps a path on this site: %s", (raw, expected) => {
    expect(safeCallbackUrl(raw, ORIGIN)).toBe(expected);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["another site", "https://evil.example/login"],
    ["protocol-relative", "//evil.example/login"],
    ["backslash the browser reads as a slash", "/\\evil.example"],
    ["tab hidden between the slashes", "/\t/evil.example"],
    ["javascript: URL", "javascript:alert(1)"],
    ["data: URL", "data:text/html,<script>alert(1)</script>"],
    ["same host, other scheme", "http://staging.circadium.app/calendar"],
    ["a sibling subdomain", "https://circadium.app/calendar"],
    ["the login page", "/auth/login"],
    ["the register page", "/auth/register?callbackUrl=%2Fcalendar"],
  ])("falls back to the dashboard for %s", (_label, raw) => {
    expect(safeCallbackUrl(raw, ORIGIN)).toBe("/dashboard");
  });
});
