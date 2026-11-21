/**
 * Format an ISO timestamp (or Date) into the value shape an
 * <input type="datetime-local"> expects: "YYYY-MM-DDTHH:MM" in local time.
 */
export function formatDatetimeLocal(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Parse the value of an <input type="datetime-local"> back into an ISO string.
 * Returns empty string if the input is empty or invalid.
 */
export function parseDatetimeLocal(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}
