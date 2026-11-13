"use client";

// Device vault for the user's Anthropic API key (BYOK). The key never reaches
// our server: it is AES-GCM-encrypted under a NON-EXTRACTABLE WebCrypto key
// and both live in IndexedDB, scoped per userId. That protects the key at
// rest (disk, backups, other OS accounts, anything that only reads
// localStorage); like any client-side store it cannot protect against script
// running inside the app origin — so the decrypted key is held only in a
// module-scoped cache, never in React state, Redux, or localStorage.

const DB_NAME = "circadium.ai";
const DB_VERSION = 1;
const STORE = "keys";

interface StoredKeyRecord {
  userId: string;
  cryptoKey: CryptoKey;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
  hint: string;
  updatedAt: number;
}

// Decrypted keys for this page load. Cleared on remove/replace.
const keyCache = new Map<string, string>();

function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB transaction failed"));
        };
      }),
  );
}

async function getRecord(userId: string): Promise<StoredKeyRecord | null> {
  if (!idbAvailable()) return null;
  try {
    const record = await withStore(
      "readonly",
      (s) => s.get(userId) as IDBRequest<StoredKeyRecord | undefined>,
    );
    return record ?? null;
  } catch {
    return null;
  }
}

export function deriveKeyHint(apiKey: string): string {
  const tail = apiKey.slice(-4);
  return apiKey.startsWith("sk-ant-") ? `sk-ant-…${tail}` : `…${tail}`;
}

// Pure crypto helpers, separated from the IndexedDB glue so they are
// unit-testable against Node's webcrypto.
export async function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptApiKey(
  vaultKey: CryptoKey,
  apiKey: string,
): Promise<{ iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    vaultKey,
    new TextEncoder().encode(apiKey),
  );
  return { iv, ciphertext };
}

export async function decryptApiKey(
  vaultKey: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  ciphertext: ArrayBuffer,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    vaultKey,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

export async function storeAiKey(userId: string, rawApiKey: string): Promise<void> {
  if (!idbAvailable()) {
    throw new Error("This browser can't store the key on this device.");
  }
  const apiKey = rawApiKey.trim();
  const vaultKey = await generateVaultKey();
  const { iv, ciphertext } = await encryptApiKey(vaultKey, apiKey);
  const record: StoredKeyRecord = {
    userId,
    cryptoKey: vaultKey,
    iv,
    ciphertext,
    hint: deriveKeyHint(apiKey),
    updatedAt: Date.now(),
  };
  await withStore("readwrite", (s) => s.put(record));
  keyCache.set(userId, apiKey);
}

export async function loadAiKey(userId: string): Promise<string | null> {
  const cached = keyCache.get(userId);
  if (cached) return cached;
  const record = await getRecord(userId);
  if (!record) return null;
  try {
    const apiKey = await decryptApiKey(record.cryptoKey, record.iv, record.ciphertext);
    keyCache.set(userId, apiKey);
    return apiKey;
  } catch {
    // Corrupt or foreign record — unusable, so drop it rather than failing
    // every future load.
    await clearAiKey(userId);
    return null;
  }
}

export async function clearAiKey(userId: string): Promise<void> {
  keyCache.delete(userId);
  if (!idbAvailable()) return;
  try {
    await withStore("readwrite", (s) => s.delete(userId));
  } catch {
    // Removal is best-effort; the cache entry is already gone.
  }
}

export async function getAiKeyHint(userId: string): Promise<string | null> {
  const record = await getRecord(userId);
  return record?.hint ?? null;
}

export async function hasAiKey(userId: string): Promise<boolean> {
  if (keyCache.has(userId)) return true;
  return (await getRecord(userId)) !== null;
}

export type AiKeyValidation = { ok: true } | { ok: false; message: string };

// models.list() is free (no tokens), so it doubles as the cheapest possible
// "is this key real" probe.
export async function validateAiKey(apiKey: string): Promise<AiKeyValidation> {
  const trimmed = apiKey.trim();
  if (!trimmed) return { ok: false, message: "Enter an API key." };
  const [{ createBrowserAnthropicClient }, sdk] = await Promise.all([
    import("@/utils/draft/assistantEngine/anthropicClient"),
    import("@anthropic-ai/sdk"),
  ]);
  const client = createBrowserAnthropicClient(trimmed);
  try {
    await client.models.list();
    return { ok: true };
  } catch (err) {
    if (err instanceof sdk.default.AuthenticationError) {
      return { ok: false, message: "Anthropic rejected this key — check it and try again." };
    }
    if (err instanceof sdk.default.APIConnectionError) {
      return {
        ok: false,
        message: "Couldn't reach Anthropic — check your connection and try again.",
      };
    }
    return { ok: false, message: "Couldn't validate the key. Try again in a moment." };
  }
}
