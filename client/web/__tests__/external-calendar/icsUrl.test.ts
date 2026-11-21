import {
  normalizeIcsUrl,
  googleShareLinkCalendarId,
  googlePublicIcsUrl,
} from "@/utils/external-calendar/icsUrl";

describe("normalizeIcsUrl", () => {
  it("accepts https, rewrites webcal, rejects garbage", () => {
    expect(normalizeIcsUrl("https://example.com/cal.ics")).toBe(
      "https://example.com/cal.ics",
    );
    expect(normalizeIcsUrl("webcal://example.com/cal.ics")).toBe(
      "https://example.com/cal.ics",
    );
    expect(normalizeIcsUrl("example.com/cal.ics")).toBe(
      "https://example.com/cal.ics",
    );
    expect(normalizeIcsUrl("")).toBeNull();
    expect(normalizeIcsUrl("not a url at all")).toBeNull();
  });
});

describe("googleShareLinkCalendarId", () => {
  it("decodes the cid from a sharing link", () => {
    // dXNlckBleGFtcGxlLmNvbQ == base64url("user@example.com")
    expect(
      googleShareLinkCalendarId(
        "https://calendar.google.com/calendar/u/1?cid=dXNlckBleGFtcGxlLmNvbQ",
      ),
    ).toBe("user@example.com");
  });

  it("ignores real ICS feed URLs and non-Google hosts", () => {
    expect(
      googleShareLinkCalendarId(
        "https://calendar.google.com/calendar/ical/user%40example.com/private-abc123/basic.ics",
      ),
    ).toBeNull();
    expect(
      googleShareLinkCalendarId("https://example.com/?cid=dXNlckBleGFtcGxlLmNvbQ"),
    ).toBeNull();
    expect(
      googleShareLinkCalendarId("https://calendar.google.com/calendar/u/0/r"),
    ).toBeNull();
  });

  it("builds the public feed URL for a decoded id", () => {
    expect(googlePublicIcsUrl("user@example.com")).toBe(
      "https://calendar.google.com/calendar/ical/user%40example.com/public/basic.ics",
    );
  });
});
