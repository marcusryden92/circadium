// Cold starts (serverless wake + Neon compute resuming from zero) make the
// first DB queries of a request time out or throw. These reads are idempotent,
// so a few short retries absorb the wake window instead of surfacing as a
// failed render. Client-safe (setTimeout only), used on both sides.
export async function retry<T>(
  op: () => Promise<T>,
  { attempts = 3, baseDelayMs = 200 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await op();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** i));
      }
    }
  }
  throw lastError;
}
