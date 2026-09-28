/**
 * Shared (browser + CDN/edge) cache policy for public activity responses.
 *
 * Every serverless isolate keeps its own in-process cache, so a cold isolate
 * still pays full BigQuery cost even when another isolate just served the same
 * period. These headers let the edge reuse a warm response across isolates.
 *
 * TTL choice is driven by whether the requested period is still accumulating:
 *
 * - **In-progress period** (`isPeriodComplete: false`, e.g. "today"): the
 *   numbers move with every Hubble batch, so the shared TTL is short.
 * - **Complete period** (`isPeriodComplete: true`): the window is closed and
 *   the numbers can only change on backfill, so the shared TTL is longer.
 *
 * Both TTLs are capped by the in-process `CACHE_TTL_SECONDS` default so an edge
 * copy can never be older than a fresh in-process entry.
 */

import { DEFAULT_CACHE_TTL_SECONDS } from "@/lib/hubble/cache";

/** Longest shared TTL we are willing to hand to a CDN, in seconds. */
export const MAX_SHARED_TTL_SECONDS = 900;

/** Shared TTL for a period that is still accumulating (e.g. "today"). */
export const IN_PROGRESS_SHARED_TTL_SECONDS = 60;

/** Shared TTL for a closed period. Capped by the in-process cache default. */
export const COMPLETE_SHARED_TTL_SECONDS = Math.min(
  DEFAULT_CACHE_TTL_SECONDS,
  MAX_SHARED_TTL_SECONDS,
);

export interface SharedCacheOptions {
  /** From the response payload: true when the period window is closed. */
  isPeriodComplete: boolean;
}

function directives(ttlSeconds: number): string {
  return `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`;
}

/**
 * Cache headers for a successful activity/timeseries response.
 *
 * `CDN-Cache-Control` targets generic CDNs and `Vercel-CDN-Cache-Control`
 * targets the deployment platform's edge cache; both mirror `Cache-Control` so
 * browsers and shared caches agree on the same TTL.
 */
export function activityCacheHeaders({
  isPeriodComplete,
}: SharedCacheOptions): Record<string, string> {
  const ttl = isPeriodComplete
    ? COMPLETE_SHARED_TTL_SECONDS
    : IN_PROGRESS_SHARED_TTL_SECONDS;
  const control = directives(ttl);

  return {
    "Cache-Control": control,
    "CDN-Cache-Control": control,
    "Vercel-CDN-Cache-Control": control,
  };
}

/** Errors, validation failures and other non-200 responses are never cached. */
export const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
};
