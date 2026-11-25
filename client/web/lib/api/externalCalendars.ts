import {
  ExternalCalendarMode,
  type ExternalCalendarSource,
  type ExternalEvent,
} from "@/types/prisma";
import { ApiError, apiRequest } from "@/lib/api/client";

// External-calendar sources and their materialized events, plus the Google
// and Microsoft calendar-integration endpoints. All outside the OCC diff sync.

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  backgroundColor: string | null;
  primary: boolean;
  accessRole: string;
}

export interface MicrosoftCalendarListEntry {
  id: string;
  name: string;
  hexColor: string | null;
  isDefault: boolean;
}

// PatchField carries the tri-state the Java PATCH endpoint needs: absent means
// leave the field alone; {set:true, value} means write (even null).
type PatchField = { set: true; value: string | null } | null;

function pf(v: string | null | undefined): PatchField {
  return v === undefined ? null : { set: true, value: v ?? null };
}

export async function fetchExternalCalendarData(): Promise<
  | { success: true; sources: ExternalCalendarSource[]; events: ExternalEvent[] }
  | { success: false; error: string }
> {
  try {
    const r = await apiRequest<{ sources: ExternalCalendarSource[]; events: ExternalEvent[] }>(
      "/external-calendars",
      { authenticated: true },
    );
    return { success: true, ...r };
  } catch {
    return { success: false, error: "Failed to fetch external calendars" };
  }
}

export async function addExternalCalendarSource(input: {
  url: string;
  name?: string;
  color?: string | null;
  mode?: ExternalCalendarMode;
}): Promise<
  | { success: true; source: ExternalCalendarSource; events: ExternalEvent[] }
  | { success: false; error: string }
> {
  try {
    const r = await apiRequest<{ source: ExternalCalendarSource; events: ExternalEvent[] }>(
      "/external-calendars",
      { body: input, authenticated: true },
    );
    return { success: true, ...r };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to add the calendar",
    };
  }
}

export async function refreshExternalCalendarSource(sourceId: string): Promise<
  | { success: true; source: ExternalCalendarSource; events: ExternalEvent[] }
  | { success: false; error: string; source?: ExternalCalendarSource }
> {
  try {
    const r = await apiRequest<{ source: ExternalCalendarSource; events: ExternalEvent[] }>(
      `/external-calendars/${encodeURIComponent(sourceId)}/refresh`,
      { method: "POST", authenticated: true },
    );
    return { success: true, ...r };
  } catch (error) {
    if (error instanceof ApiError) {
      const src = error.problem.source as ExternalCalendarSource | undefined;
      return { success: false, error: error.message, ...(src ? { source: src } : {}) };
    }
    return { success: false, error: "Failed to refresh the calendar" };
  }
}

export async function updateExternalCalendarSource(
  sourceId: string,
  patch: {
    name?: string;
    color?: string | null;
    mode?: ExternalCalendarMode;
    enabled?: boolean;
    locationId?: string | null;
  },
): Promise<
  | { success: true; source: ExternalCalendarSource }
  | { success: false; error: string }
> {
  try {
    const source = await apiRequest<ExternalCalendarSource>(
      `/external-calendars/${encodeURIComponent(sourceId)}`,
      {
        method: "PATCH",
        body: {
          name: patch.name,
          mode: patch.mode,
          enabled: patch.enabled,
          color: pf(patch.color),
          locationId: pf(patch.locationId),
        },
        authenticated: true,
      },
    );
    return { success: true, source };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to update the calendar",
    };
  }
}

export async function deleteExternalCalendarSource(
  sourceId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiRequest<void>(
      `/external-calendars/${encodeURIComponent(sourceId)}`,
      { method: "DELETE", authenticated: true },
    );
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to remove the calendar",
    };
  }
}

export async function toggleExternalEventBusyException(
  sourceId: string,
  uid: string,
): Promise<
  | { success: true; source: ExternalCalendarSource }
  | { success: false; error: string }
> {
  try {
    const source = await apiRequest<ExternalCalendarSource>(
      `/external-calendars/${encodeURIComponent(sourceId)}/busy-exception`,
      { body: { uid }, authenticated: true },
    );
    return { success: true, source };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to update the event",
    };
  }
}

export async function setExternalEventLocation(
  sourceId: string,
  uid: string,
  next: { inherit: true } | { locationId: string | null },
): Promise<
  | { success: true; source: ExternalCalendarSource }
  | { success: false; error: string }
> {
  try {
    const inherit = "inherit" in next;
    const locationId = inherit ? undefined : next.locationId;
    const source = await apiRequest<ExternalCalendarSource>(
      `/external-calendars/${encodeURIComponent(sourceId)}/event-location`,
      {
        method: "PUT",
        body: { uid, inherit, ...(inherit ? {} : { locationId }) },
        authenticated: true,
      },
    );
    return { success: true, source };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to update the event",
    };
  }
}

export async function getGoogleCalendarStatus(): Promise<{
  connected: boolean;
  email: string | null;
}> {
  try {
    return await apiRequest<{ connected: boolean; email: string | null }>(
      "/integrations/google/status",
      { authenticated: true },
    );
  } catch {
    return { connected: false, email: null };
  }
}

export async function listGoogleCalendars(): Promise<
  | { success: true; calendars: GoogleCalendarListEntry[] }
  | { success: false; error: string }
> {
  try {
    const r = await apiRequest<{ calendars: GoogleCalendarListEntry[] }>(
      "/integrations/google/calendars",
      { authenticated: true },
    );
    return { success: true, calendars: r.calendars };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to list calendars",
    };
  }
}

export async function addGoogleCalendarSource(input: {
  calendarId: string;
  name?: string;
  color?: string | null;
}): Promise<
  | { success: true; source: ExternalCalendarSource; events: ExternalEvent[] }
  | { success: false; error: string }
> {
  try {
    const r = await apiRequest<{ source: ExternalCalendarSource; events: ExternalEvent[] }>(
      "/integrations/google/sources",
      { body: input, authenticated: true },
    );
    return { success: true, ...r };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to add the calendar",
    };
  }
}

export async function disconnectGoogleCalendar(): Promise<
  | { success: true; removedSourceIds: string[]; revoked: boolean }
  | { success: false; error: string }
> {
  try {
    const r = await apiRequest<{ removedSourceIds: string[]; revoked: boolean }>(
      "/integrations/google/connection",
      { method: "DELETE", authenticated: true },
    );
    return { success: true, ...r };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to disconnect",
    };
  }
}

export async function getMicrosoftCalendarStatus(): Promise<{
  connected: boolean;
  email: string | null;
}> {
  try {
    return await apiRequest<{ connected: boolean; email: string | null }>(
      "/integrations/microsoft/status",
      { authenticated: true },
    );
  } catch {
    return { connected: false, email: null };
  }
}

export async function listMicrosoftCalendars(): Promise<
  | { success: true; calendars: MicrosoftCalendarListEntry[] }
  | { success: false; error: string }
> {
  try {
    const r = await apiRequest<{ calendars: MicrosoftCalendarListEntry[] }>(
      "/integrations/microsoft/calendars",
      { authenticated: true },
    );
    return { success: true, calendars: r.calendars };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to list calendars",
    };
  }
}

export async function addMicrosoftCalendarSource(input: {
  calendarId: string;
  name?: string;
  color?: string | null;
}): Promise<
  | { success: true; source: ExternalCalendarSource; events: ExternalEvent[] }
  | { success: false; error: string }
> {
  try {
    const r = await apiRequest<{ source: ExternalCalendarSource; events: ExternalEvent[] }>(
      "/integrations/microsoft/sources",
      { body: input, authenticated: true },
    );
    return { success: true, ...r };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to add the calendar",
    };
  }
}

export async function disconnectMicrosoftCalendar(): Promise<
  | { success: true; removedSourceIds: string[] }
  | { success: false; error: string }
> {
  try {
    const r = await apiRequest<{ removedSourceIds: string[] }>(
      "/integrations/microsoft/connection",
      { method: "DELETE", authenticated: true },
    );
    return { success: true, ...r };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ApiError ? error.message : "Failed to disconnect",
    };
  }
}
