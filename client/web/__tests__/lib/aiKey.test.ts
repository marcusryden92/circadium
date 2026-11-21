/**
 * @jest-environment node
 */

// Pure-crypto layer of the BYOK device vault (lib/aiKey). The IndexedDB glue
// is browser-only and exercised by hand; these tests pin the encryption
// contract: AES-GCM round trip, fresh IVs, non-extractable vault keys, and
// the masked hint. Runs under the node environment for globalThis.crypto.

import {
  decryptApiKey,
  deriveKeyHint,
  encryptApiKey,
  generateVaultKey,
} from "@/lib/aiKey";

const SAMPLE_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwx-yz12";

describe("aiKey crypto", () => {
  it("round-trips an API key through encrypt/decrypt", async () => {
    const vaultKey = await generateVaultKey();
    const { iv, ciphertext } = await encryptApiKey(vaultKey, SAMPLE_KEY);
    await expect(decryptApiKey(vaultKey, iv, ciphertext)).resolves.toBe(
      SAMPLE_KEY,
    );
  });

  it("uses a fresh IV per encryption so equal plaintexts diverge", async () => {
    const vaultKey = await generateVaultKey();
    const first = await encryptApiKey(vaultKey, SAMPLE_KEY);
    const second = await encryptApiKey(vaultKey, SAMPLE_KEY);
    expect(Buffer.from(first.iv).equals(Buffer.from(second.iv))).toBe(false);
    expect(
      Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext)),
    ).toBe(false);
  });

  it("rejects decryption under a different vault key", async () => {
    const vaultKey = await generateVaultKey();
    const otherKey = await generateVaultKey();
    const { iv, ciphertext } = await encryptApiKey(vaultKey, SAMPLE_KEY);
    await expect(decryptApiKey(otherKey, iv, ciphertext)).rejects.toBeDefined();
  });

  it("generates non-extractable vault keys", async () => {
    const vaultKey = await generateVaultKey();
    expect(vaultKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", vaultKey)).rejects.toBeDefined();
  });

  it("derives a masked hint that keeps only the tail", () => {
    expect(deriveKeyHint(SAMPLE_KEY)).toBe("sk-ant-…yz12");
    expect(deriveKeyHint("something-else-1234")).toBe("…1234");
    expect(deriveKeyHint(SAMPLE_KEY)).not.toContain("abcdefgh");
  });
});
