import { isAllowedThroughStagingGate } from "@/lib/stagingGate";

const basic = (credentials: string) =>
  `Basic ${btoa(
    encodeURIComponent(credentials).replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    ),
  )}`;

describe("isAllowedThroughStagingGate", () => {
  it("lets everything through when no password is configured", () => {
    expect(isAllowedThroughStagingGate(null, undefined)).toBe(true);
    expect(isAllowedThroughStagingGate(null, "")).toBe(true);
  });

  it("requires credentials once a password is configured", () => {
    expect(isAllowedThroughStagingGate(null, "s3cret")).toBe(false);
    expect(isAllowedThroughStagingGate("Bearer abc", "s3cret")).toBe(false);
  });

  it("accepts the right password with any username", () => {
    expect(isAllowedThroughStagingGate(basic("me:s3cret"), "s3cret")).toBe(true);
    expect(isAllowedThroughStagingGate(basic(":s3cret"), "s3cret")).toBe(true);
  });

  it("keeps colons that belong to the password", () => {
    expect(isAllowedThroughStagingGate(basic("me:a:b"), "a:b")).toBe(true);
  });

  it("compares non-ASCII passwords as UTF-8", () => {
    expect(isAllowedThroughStagingGate(basic("me:lösen"), "lösen")).toBe(true);
  });

  it("rejects wrong passwords and malformed headers", () => {
    expect(isAllowedThroughStagingGate(basic("me:wrong"), "s3cret")).toBe(false);
    expect(isAllowedThroughStagingGate(basic("me:s3cre"), "s3cret")).toBe(false);
    expect(isAllowedThroughStagingGate(basic("no-separator"), "s3cret")).toBe(false);
    expect(isAllowedThroughStagingGate("Basic %%%", "s3cret")).toBe(false);
  });
});
