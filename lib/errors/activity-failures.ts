/**
 * Client-visible failure taxonomy for dashboard data requests.
 *
 * A single `INTERNAL_ERROR` code used to cover every server-side activity
 * failure, which made the dashboard print "Verify GOOGLE_APPLICATION_CREDENTIALS"
 * even when `/api/health` proved the credentials work and the real failure was
 * application SQL (schema drift, bad table, permission on the dataset, ...).
 *
 * This module owns three things:
 *
 * 1. `classifyUpstreamFailure()` – server-side classification of a thrown error
 *    into one of three public codes.
 * 2. `toPublicActivityError()` – the safe `{ code, message }` body sent to
 *    clients (never leaks provider detail).
 * 3. `activityErrorCopy()` – the UI copy matrix, so the credentials hint is
 *    only ever rendered for the credentials-missing class.
 *
 * The module is dependency-free so it can be imported from route handlers and
 * client components alike.
 */

import type { ApiErrorResponse } from "@/lib/types";

export const ACTIVITY_ERROR_CODES = [
  "CREDENTIALS_MISSING",
  "UPSTREAM_QUERY_FAILED",
  "INTERNAL_ERROR",
] as const;

export type ActivityErrorCode = (typeof ACTIVITY_ERROR_CODES)[number];

/**
 * Signatures of a *missing or unusable service account*. When these match, the
 * server never reached BigQuery, so a credentials hint is actionable.
 */
const CREDENTIALS_MISSING_PATTERNS = [
  "credentials are required",
  "credentials are not configured",
  "could not load the default credentials",
  "default credentials",
  "invalid grant",
  "invalid authentication credentials",
  "unable to authenticate",
  "gcp_service_account_key",
];

/**
 * Signatures of a *query that reached BigQuery and failed*. Credentials already
 * work in this class, so the credentials hint is actively misleading here.
 */
const UPSTREAM_QUERY_PATTERNS = [
  "bigquery",
  "syntax error",
  "unrecognized name",
  "not found: table",
  "not found: dataset",
  "invalid table name",
  "invalid field name",
  "permission denied",
  "access denied",
  "bytes billed",
  "query exceeded",
  "job failed",
  "query failed",
];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function matches(message: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => message.includes(pattern));
}

/**
 * Classify a thrown error into one of the three public codes.
 *
 * `CREDENTIALS_MISSING` wins over `UPSTREAM_QUERY_FAILED` because a message can
 * mention both (for example "BigQuery credentials are required ..."), and only
 * the credentials class makes the credentials hint correct.
 */
export function classifyUpstreamFailure(error: unknown): ActivityErrorCode {
  const message = errorMessage(error).toLowerCase();
  if (!message) return "INTERNAL_ERROR";

  if (matches(message, CREDENTIALS_MISSING_PATTERNS)) {
    return "CREDENTIALS_MISSING";
  }

  if (matches(message, UPSTREAM_QUERY_PATTERNS)) {
    return "UPSTREAM_QUERY_FAILED";
  }

  return "INTERNAL_ERROR";
}

const PUBLIC_MESSAGES: Record<ActivityErrorCode, string> = {
  CREDENTIALS_MISSING:
    "BigQuery credentials are not configured on the server, so live data cannot be queried.",
  UPSTREAM_QUERY_FAILED:
    "The upstream Hubble query failed. Retrying may help; credentials are configured.",
  INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
};

/**
 * Build the safe error body for a failed activity request. Provider detail is
 * deliberately dropped; only the class and a fixed message cross the wire.
 */
export function toPublicActivityError(
  error: unknown,
): ApiErrorResponse & { code: ActivityErrorCode } {
  const code = classifyUpstreamFailure(error);
  return { code, message: PUBLIC_MESSAGES[code] };
}

/**
 * Error thrown by client-side fetchers so the failure code survives the trip
 * through React Query (which otherwise only carries `message`).
 */
export class ActivityRequestError extends Error {
  public readonly code: ActivityErrorCode;
  public readonly status: number;

  constructor(code: ActivityErrorCode, message: string, status: number) {
    super(message);
    this.name = "ActivityRequestError";
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, ActivityRequestError.prototype);
  }
}

function isActivityErrorCode(value: unknown): value is ActivityErrorCode {
  return (
    typeof value === "string" &&
    (ACTIVITY_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** Normalize an unknown thrown value (API body, Error, string) to a code. */
export function classifyActivityError(error: unknown): ActivityErrorCode {
  if (error instanceof ActivityRequestError) return error.code;

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (isActivityErrorCode(code)) return code;
  }

  return "INTERNAL_ERROR";
}

/**
 * Build an `ActivityRequestError` from a non-2xx API response body.
 * Falls back to `INTERNAL_ERROR` for unparsable or unknown payloads.
 */
export function activityRequestErrorFromBody(
  body: unknown,
  status: number,
  fallbackMessage = "Failed to load activity data",
): ActivityRequestError {
  if (body && typeof body === "object") {
    const record = body as { code?: unknown; message?: unknown };
    const code = isActivityErrorCode(record.code) ? record.code : "INTERNAL_ERROR";
    const message =
      typeof record.message === "string" && record.message.length > 0
        ? record.message
        : fallbackMessage;
    return new ActivityRequestError(code, message, status);
  }

  return new ActivityRequestError("INTERNAL_ERROR", fallbackMessage, status);
}

export interface ActivityErrorCopy {
  code: ActivityErrorCode;
  /** Short headline for the failing widget. */
  title: string;
  /** User-facing explanation. */
  message: string;
  /** Optional secondary line. Rendered only when non-null. */
  hint: string | null;
  /** True only for the credentials-missing class. */
  showCredentialsHint: boolean;
  /** Whether a retry button is meaningful for this class. */
  retryable: boolean;
}

const CREDENTIALS_HINT =
  "Verify GOOGLE_APPLICATION_CREDENTIALS (or GCP_SERVICE_ACCOUNT_KEY) on the server.";

const ERROR_COPY: Record<ActivityErrorCode, ActivityErrorCopy> = {
  CREDENTIALS_MISSING: {
    code: "CREDENTIALS_MISSING",
    title: "Data source not configured",
    message:
      "Live Hubble data is unavailable because BigQuery credentials are missing on the server.",
    hint: CREDENTIALS_HINT,
    showCredentialsHint: true,
    retryable: true,
  },
  UPSTREAM_QUERY_FAILED: {
    code: "UPSTREAM_QUERY_FAILED",
    title: "Upstream query failed",
    message:
      "Credentials are configured, but the Hubble query failed. This is usually transient or a schema mismatch.",
    hint: "Retry now. If it keeps failing, the deployed query is likely out of sync with the dataset.",
    showCredentialsHint: false,
    retryable: true,
  },
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    title: "Unexpected error",
    message: "An unexpected error occurred. Please try again later.",
    hint: null,
    showCredentialsHint: false,
    retryable: true,
  },
};

/**
 * Resolve the UI copy for a thrown value. React Query errors, raw API bodies and
 * plain Errors are all accepted so widgets can call this directly.
 */
export function activityErrorCopy(error: unknown): ActivityErrorCopy {
  return ERROR_COPY[classifyActivityError(error)];
}
