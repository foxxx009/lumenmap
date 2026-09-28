import { NextResponse } from "next/server";
import { z } from "zod";

import { buildDappLeaderboard } from "@/lib/dapps/leaderboard";
import { resolveDataSource } from "@/lib/data-source";
import { getFixtureActivityData } from "@/lib/fixtures/activity";
import { getActivityData } from "@/lib/hubble/activity";
import { BigQueryLimitExceededError } from "@/lib/hubble/errors";
import { PERIOD_OPTIONS } from "@/lib/periods";
import {
  classifyError,
  createCorrelationId,
  endTimer,
  logError,
  logInfo,
  startTimer,
} from "@/lib/log";
import { dappLeaderboardSchema } from "@/lib/schemas/dapps-response";
import type { ActivityDataset, ApiErrorResponse, Period } from "@/lib/types";

export type DappsFetcher = (period: Period) => Promise<ActivityDataset>;

const SUPPORTED_PERIODS = PERIOD_OPTIONS.map((period) => period.value);
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/** Mirrors the shared-cache policy used by the activity routes. */
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=900, s-maxage=900",
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

const PUBLIC_VALIDATION_ERROR = "Dapps response failed validation";

export type ParsedDappsQuery =
  | { ok: true; period: Period; limit?: number }
  | { ok: false; body: ApiErrorResponse & { supported?: string[] }; status: 400 };

const periodSchema = z.enum(
  SUPPORTED_PERIODS as [Period, ...Period[]],
);

const limitSchema = z.coerce.number().int().min(MIN_LIMIT).max(MAX_LIMIT);

/**
 * Validate the public query string with Zod.
 *
 * Only the period is required; `limit` is optional. Every rejection returns a
 * fixed safe message - user input is never echoed back.
 */
export function parseDappsQuery(params: URLSearchParams): ParsedDappsQuery {
  const periodParam = params.get("period");
  const limitParam = params.get("limit");

  let resolvedPeriod: Period = "1d";
  if (periodParam !== null) {
    const period = periodSchema.safeParse(periodParam);
    if (!period.success) {
      return {
        ok: false,
        body: {
          code: "INVALID_PERIOD",
          message: "Unsupported dapps period.",
          supported: SUPPORTED_PERIODS,
        },
        status: 400,
      };
    }
    resolvedPeriod = period.data;
  }

  if (limitParam !== null) {
    const limit = limitSchema.safeParse(limitParam);
    if (!limit.success) {
      return {
        ok: false,
        body: {
          code: "INVALID_LIMIT",
          message: `Limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}.`,
        },
        status: 400,
      };
    }

    return { ok: true, period: resolvedPeriod, limit: limit.data };
  }

  return { ok: true, period: resolvedPeriod };
}

export async function handleDappsRequest(
  request: Request,
  fetchActivityData: DappsFetcher = getActivityData,
) {
  const correlationId = createCorrelationId();
  const timer = startTimer();
  const { searchParams } = new URL(request.url);
  const parsed = parseDappsQuery(searchParams);

  if (!parsed.ok) {
    return NextResponse.json(parsed.body, {
      status: parsed.status,
      headers: NO_STORE_HEADERS,
    });
  }

  logInfo({
    event: "dapps.request.start",
    correlationId,
    period: parsed.period,
  });

  // Fixture mode is opt-in only (LUMENMAP_DATA_SOURCE=fixture) and blocked in production.
  let dataSourceMode: "live" | "fixture" = "live";
  try {
    dataSourceMode = resolveDataSource();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError({
      event: "dapps.request.error",
      correlationId,
      period: parsed.period,
      durationMs: endTimer(timer),
      errorClass: "validation",
      errorMessage: message,
    });
    return NextResponse.json(
      { code: "INVALID_DATA_SOURCE", message },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const useFixture =
      fetchActivityData === getActivityData && dataSourceMode === "fixture";
    const data = useFixture
      ? getFixtureActivityData(parsed.period)
      : await fetchActivityData(parsed.period);

    const leaderboard = buildDappLeaderboard(data, { limit: parsed.limit });
    const validated = dappLeaderboardSchema.safeParse(
      useFixture ? { ...leaderboard, fixture: true } : leaderboard,
    );

    if (!validated.success) {
      const issue = validated.error.issues[0];
      logError({
        event: "dapps.request.error",
        correlationId,
        period: parsed.period,
        durationMs: endTimer(timer),
        errorClass: "validation",
        errorMessage: `schema path "${issue?.path.join(".") ?? "(root)"}": ${issue?.message ?? "unknown"}`,
      });
      return NextResponse.json(
        { error: PUBLIC_VALIDATION_ERROR },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    logInfo({
      event: "dapps.request.complete",
      correlationId,
      period: parsed.period,
      durationMs: endTimer(timer),
    });

    return NextResponse.json(validated.data, { headers: CACHE_HEADERS });
  } catch (error) {
    if (error instanceof BigQueryLimitExceededError) {
      logError({
        event: "dapps.request.error",
        correlationId,
        period: parsed.period,
        durationMs: endTimer(timer),
        errorClass: "provider",
        errorMessage: error.message,
      });
      return NextResponse.json(
        {
          code: "LIMIT_EXCEEDED",
          message: error.message,
        } satisfies ApiErrorResponse,
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to fetch dapps data";
    console.error("[dapps] Failed to fetch dapps data:", message, error);
    logError({
      event: "dapps.request.error",
      correlationId,
      period: parsed.period,
      durationMs: endTimer(timer),
      errorClass: classifyError(error),
      errorMessage: message,
    });

    return NextResponse.json(
      {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      } satisfies ApiErrorResponse,
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function GET(request: Request) {
  return handleDappsRequest(request);
}
