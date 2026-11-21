import { ApiError } from "@/lib/api/client";

/**
 * A sentence to show the user for a failed API call. Java's 4xx `detail`
 * strings are written for people ("This link has expired. Request a new
 * one."), so they pass through; the cases below are the ones where the raw
 * text would be wrong or unhelpful.
 */
export function describeApiError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  if (error.status === 0) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (error.status === 429) return tryAgainLater(error.retryAfterSeconds);
  if (error.status >= 500) {
    return "Something went wrong on our side. Try again in a moment.";
  }
  // Bean Validation's messages are developer English; the forms validate the
  // same rules before sending, so this only shows when the two disagree.
  if (Object.keys(error.fieldErrors).length > 0) {
    return "Some of the details you entered were not accepted. Check them and try again.";
  }
  return error.message;
}

function tryAgainLater(seconds: number | undefined): string {
  if (seconds === undefined) return "Too many attempts. Try again later.";
  if (seconds < 60) {
    return `Too many attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
