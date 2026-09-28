import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  handleTimeseriesRequest,
  parseTimeseriesGranularity,
  parseTimeseriesPeriod,
} from "./_handler";
import { buildActivityMetricProvenance } from "@/lib/metrics/provenance";
import type { Period } from "@/lib/types";
import type { TimeseriesResponse } from "@/lib/hubble/timeseries-data";

const supportedPeriods: Period[] = ["1d", "7d", "30d", "month"];

function mockTimeseriesResponse(period: Period): TimeseriesResponse {
  return {
    period,
    start: "2026-08-03T00:00:00.000Z",
    end: "2026-08-03T23:59:59.999Z",
    source: "hubble",
    sourceTimestamp: "2026-08-03T12:00:00.000Z",
    isPeriodComplete: false,
    granularity: period === "1d" ? "hour" : "day",
    buckets: [
      {
        timestamp: "2026-08-03T00:00:00.000Z",
        label: period === "1d" ? "00:00 UTC" : "Aug 3",
        transactions: 100,
        operations: 350,
      },
    ],
    totals: {
      transactions: 100,
      operations: 350,
    },
    metricProvenance: buildActivityMetricProvenance(),
  };
}

describe("parseTimeseriesPeriod", () => {
  test("defaults to 1d when absent", () => {
    assert.deepEqual(parseTimeseriesPeriod(null), { ok: true, period: "1d" });
  });

  test("rejects invalid periods", () => {
    assert.equal(parseTimeseriesPeriod("1y").ok, false);
  });
});

describe("parseTimeseriesGranularity", () => {
  test("accepts hour and day", () => {
    assert.deepEqual(parseTimeseriesGranularity("hour"), {
      ok: true,
      granularity: "hour",
    });
    assert.deepEqual(parseTimeseriesGranularity("day"), {
      ok: true,
      granularity: "day",
    });
  });

  test("rejects invalid granularity", () => {
    assert.equal(parseTimeseriesGranularity("week").ok, false);
  });
});

describe("GET /api/v1/timeseries", () => {
  test("returns 200 for supported periods", async () => {
    for (const period of supportedPeriods) {
      const response = await handleTimeseriesRequest(
        new Request(`http://localhost/api/v1/timeseries?period=${period}`),
        async (requestedPeriod) => mockTimeseriesResponse(requestedPeriod),
      );

      assert.equal(response.status, 200);
      const body = (await response.json()) as TimeseriesResponse;
      assert.equal(body.period, period);
      assert.ok(body.metricProvenance.operation_count);
      assert.ok(Array.isArray(body.buckets));
    }
  });

  test("returns 400 for invalid period without invoking provider", async () => {
    let calls = 0;
    const response = await handleTimeseriesRequest(
      new Request("http://localhost/api/v1/timeseries?period=1y"),
      async () => {
        calls += 1;
        return mockTimeseriesResponse("1d");
      },
    );

    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  });

  test("returns 400 for invalid granularity", async () => {
    const response = await handleTimeseriesRequest(
      new Request("http://localhost/api/v1/timeseries?period=7d&granularity=week"),
      async () => mockTimeseriesResponse("7d"),
    );

    assert.equal(response.status, 400);
  });

  test("returns safe provider error response", async () => {
    const response = await handleTimeseriesRequest(
      new Request("http://localhost/api/v1/timeseries?period=30d"),
      async () => {
        throw new Error("BigQuery query failed with backend detail");
      },
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again later.",
    });
  });
});
