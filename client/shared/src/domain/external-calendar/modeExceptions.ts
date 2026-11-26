// ExternalCalendarSource.modeExceptions: JSON string[] of provider event UIDs
// whose busy/visual behavior flips the source's default mode.

export function parseModeExceptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export function serializeModeExceptions(uids: string[]): string | null {
  if (uids.length === 0) return null;
  return JSON.stringify(uids);
}

export function toggleModeException(
  raw: string | null | undefined,
  uid: string,
): string | null {
  const current = parseModeExceptions(raw);
  const next = current.includes(uid)
    ? current.filter((u) => u !== uid)
    : [...current, uid];
  return serializeModeExceptions(next);
}
