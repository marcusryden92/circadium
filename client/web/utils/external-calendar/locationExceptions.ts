// ExternalCalendarSource.locationExceptions: JSON Record<uid, locationId | null>
// of provider event UIDs whose location overrides the source's default
// locationId. A present key wins over the source default; a null value means
// "Anywhere" (no travel), distinct from an absent key ("inherit the source
// default"). Keyed by series-level UID, so an override survives a refresh —
// the same reasoning as modeExceptions.

export type LocationExceptions = Record<string, string | null>;

export function parseLocationExceptions(
  raw: string | null | undefined,
): LocationExceptions {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: LocationExceptions = {};
    for (const [uid, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null || typeof value === "string") out[uid] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeLocationExceptions(
  map: LocationExceptions,
): string | null {
  const keys = Object.keys(map);
  if (keys.length === 0) return null;
  return JSON.stringify(map);
}

// Set an override for one UID: a locationId, or null for an explicit "Anywhere".
export function setLocationException(
  raw: string | null | undefined,
  uid: string,
  locationId: string | null,
): string | null {
  const current = parseLocationExceptions(raw);
  current[uid] = locationId;
  return serializeLocationExceptions(current);
}

// Remove a UID's override so it falls back to the source default.
export function clearLocationException(
  raw: string | null | undefined,
  uid: string,
): string | null {
  const current = parseLocationExceptions(raw);
  delete current[uid];
  return serializeLocationExceptions(current);
}

// The effective location for one event: its per-UID override when present,
// otherwise the source default. null = Anywhere (no travel injected).
export function resolveExternalEventLocation(
  source: {
    locationId?: string | null;
    locationExceptions?: string | null;
  },
  uid: string,
): string | null {
  const overrides = parseLocationExceptions(source.locationExceptions);
  if (Object.prototype.hasOwnProperty.call(overrides, uid)) {
    return overrides[uid];
  }
  return source.locationId ?? null;
}

// Whether an event carries its own override (vs inheriting the source default),
// for the popover to render "custom" vs "inherited".
export function hasLocationException(
  raw: string | null | undefined,
  uid: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    parseLocationExceptions(raw),
    uid,
  );
}
