import { ApiError, apiRequest } from "@/lib/api/client";

// The GDPR export/import pair, on the Java API (plan 2.4). Both keep the
// retired actions' {success, ...} result shape: DataSection branches on it
// rather than catching.

export type ImportMode = "replace" | "add";

export async function exportUserData(): Promise<
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string }
> {
  try {
    const data = await apiRequest<Record<string, unknown>>("/account/export", {
      authenticated: true,
    });
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof ApiError && error.status !== 0
          ? error.message
          : "Failed to export your data",
    };
  }
}

export async function importUserData(
  payload: unknown,
  mode: ImportMode,
): Promise<
  | { success: true; imported: number }
  | { success: false; error: string }
> {
  try {
    const result = await apiRequest<{ imported: number }>("/account/import", {
      body: { mode, data: payload },
      authenticated: true,
    });
    return { success: true, imported: result.imported };
  } catch (error) {
    // The API's detail strings are the retired action's user-facing wording
    // (bad file, wrong format, rolled-back failure).
    return {
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "Import failed — nothing was changed.",
    };
  }
}
