import { apiUrl } from "@/lib/session/config";
import { ensureFreshSession, refreshSession } from "@/lib/session/refresh";

/** `code` of an ApiError raised when no response arrived at all. */
export const NETWORK_ERROR = "network_error";

/** The RFC 7807 body the Java API sends with every error. */
type ProblemDetail = {
  title?: string;
  detail?: string;
  code?: string;
  errors?: Record<string, string>;
};

export class ApiError extends Error {
  /** 0 when the request never got a response (offline, DNS, CORS refusal). */
  readonly status: number;
  /** The API's stable machine-readable reason, e.g. `expired_token`. */
  readonly code: string | undefined;
  /** Bean Validation failures by field name. */
  readonly fieldErrors: Record<string, string>;
  readonly retryAfterSeconds: number | undefined;
  /**
   * The whole parsed body, for endpoints that put more than the standard
   * members on it (a stale sync carries the account's current data). Empty
   * when the body was not a JSON object.
   */
  readonly problem: Readonly<Record<string, unknown>>;

  constructor(init: {
    status: number;
    message: string;
    code?: string;
    fieldErrors?: Record<string, string>;
    retryAfterSeconds?: number;
    problem?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(init.message, { cause: init.cause });
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.fieldErrors = init.fieldErrors ?? {};
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.problem = init.problem ?? {};
  }
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON. Without a body the method defaults to GET. */
  body?: unknown;
  /**
   * The endpoint needs the signed-in user: the access cookie is refreshed
   * first if it is about to lapse, and once more if the API still answers 401.
   */
  authenticated?: boolean;
  signal?: AbortSignal;
};

/**
 * Calls the Java API from the browser. Cookies ride along (`credentials:
 * 'include'`), which is how the web authenticates; no token is ever handled in
 * script. Non-2xx responses throw ApiError; an empty body resolves undefined.
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  if (!options.authenticated) return send<T>(path, options);

  await ensureFreshSession();
  try {
    return await send<T>(path, options);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // The cookie can lapse between the freshness check and the request, e.g.
    // when the tab was asleep and its timers had not caught up yet.
    if ((await refreshSession({ force: true })) !== "refreshed") throw error;
    return send<T>(path, options);
  }
}

async function send<T>(
  path: string,
  { method, body, signal }: ApiRequestOptions,
): Promise<T> {
  const hasBody = body !== undefined;
  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, {
      method: method ?? (hasBody ? "POST" : "GET"),
      credentials: "include",
      cache: "no-store",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError({
      status: 0,
      code: NETWORK_ERROR,
      message: "Could not reach the server.",
      cause: error,
    });
  }

  if (!response.ok) throw await toApiError(response);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let problem: ProblemDetail & Record<string, unknown> = {};
  try {
    const body: unknown = await response.json();
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      problem = body as ProblemDetail & Record<string, unknown>;
    }
  } catch {
    // Not JSON, e.g. an error page from the host's proxy.
  }
  return new ApiError({
    status: response.status,
    message:
      problem.detail ??
      problem.title ??
      `Request failed with status ${response.status}.`,
    code: typeof problem.code === "string" ? problem.code : undefined,
    fieldErrors: problem.errors ?? {},
    retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
    problem,
  });
}

/** The API sends delta-seconds; the HTTP-date form is never used. */
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}
