/**
 * @jest-environment node
 */
import { loadPasswordCheck } from "@/lib/passwordStrength";
import { NewPasswordSchema, passwordLength } from "@/schemas";

function accepts(password: string): boolean {
  return NewPasswordSchema.safeParse({ password, confirmPassword: password }).success;
}

describe("new-password rules", () => {
  it("need 12 characters, as Java does", () => {
    expect(accepts("eleven-char")).toBe(false);
    expect(accepts("twelve-chars")).toBe(true);
  });

  it("count each run of spaces once, so padding does not reach the minimum", () => {
    expect(passwordLength("ab            cd")).toBe(5);
    expect(accepts("ab            cd")).toBe(false);
    expect(accepts("a few short words")).toBe(true);
  });

  it("count characters, not UTF-16 units", () => {
    expect(passwordLength("😀".repeat(6))).toBe(6);
    expect(accepts("😀".repeat(6))).toBe(false);
  });

  it("still refuse more than bcrypt's 72 bytes", () => {
    expect(accepts("é".repeat(37))).toBe(false);
  });
});

describe("loadPasswordCheck", () => {
  it("rates a common password low and an unusual long one high", async () => {
    const check = await loadPasswordCheck();

    expect(check("password1234", []).score).toBeLessThanOrEqual(1);
    expect(check("plinth-ochre-wavelet-dunmore", []).score).toBe(4);
  });

  it("counts the user's own details against the password", async () => {
    const check = await loadPasswordCheck();
    const password = "adalovelace1815";

    expect(check(password, ["adalovelace1815@example.com", "adalovelace1815"]).score)
      .toBeLessThan(check(password, []).score);
  });
});
