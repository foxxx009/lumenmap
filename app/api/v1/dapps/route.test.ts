import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { GET, handleDappsRequest, parseDappsQuery } from "./_handler";
import { buildActivityMetricProvenance } from "@/lib/metrics/provenance";
import { DAPPS_SORT } from "@/lib/schemas/dapps-response";
import type { ActivityDataset, Period } from "@/lib/types";

const supportedPeriods: Period[] = ["1d", "7d", "30d", "month"];

function mockActivityDataset(period: Period): ActivityDataset {
  return {
    period,
    start: "2026-08-03T00:00:00.000Z",
    end: "2026-08-03T23:59:59.999Z",
    source: "hubble",
    sourceTimestamp: "2026-08-03T12:00:00.000Z",
    isPeriodComplete: false,
    categories: [],
    transactionCategories: [],
    contracts: [],
    accounts: [],
    sorobanFunctions: [],
    sorobanFunctionContracts: [],
    usdcPaymentVolume: {
      amount: 0,
      unit: "USDC",
      assetSetId: "stellar-mainnet-usdc-v1",
      methodology: "docs/metric-methodology.md#usdc-payment-volume",
      assets: [],
    },
    usdcCategories: [],
    usdcAccounts: [],
    kpis: {
      totalOps: { kind: "operations", unit: "ops", value: 900 },
      sorobanShare: { kind: "share", unit: "percent", value: 0 },
      topCategory: "none",
      activeContracts: { kind: "entity_count", unit: "count", value: 0 },
      activeWallets: { kind: "entity_count", unit: "count", value: 0 },
      activeDestinationAccounts: {
        kind: "entity_count",
        unit: "count",
        value: 0,
      },
    },
    treemaps: {
      events: {
        name: "Events",
        value: 0,
        metric: "operation_count",
        unit: { kind: "count", subject: "operation" },
      },
      actors: {
        name: "Actors",
        value: 0,
        metric: "operation_count",
        unit: { kind: "count", subject: "operation" },
      },
      txn_events: {
        name: "Transaction Events",
        value: 0,
        metric: "transaction_count",
        unit: { kind: "count", subject: "transaction" },
      },
      txn_actors: {
        name: "Transaction Actors",
        value: 0,
        metric: "transaction_count",
        unit: { kind: "count", subject: "transaction" },
      },
      xlm_events: {
        name: "XLM Events",
        value: "0",
        metric: "asset_volume",
        unit: { kind: "asset", asset: { type: "native", code: "XLM" } },
      },
      xlm_actors: {
        name: "XLM Actors",
        value: "0",
        metric: "asset_volume",
        unit: { kind: "asset", asset: { type: "native", code: "XLM" } },
      },
      usdc_events: {
        name: "USDC Events",
        value: "0",
        metric: "asset_volume",
        unit: {
          kind: "asset",
          asset: {
            type: "issued",
            code: "USDC",
            issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          },
        },
      },
      usdc_actors: {
        name: "USDC Actors",
        value: "0",
        metric: "asset_volume",
        unit: {
          kind: "asset",
          asset: {
            type: "issued",
            code: "USDC",
            issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          },
        },
      },
      protocol_tvl: {
        name: "Protocol TVL",
        value: "0",
        metric: "tvl",
        unit: {
          kind: "asset",
          asset: { type: "native", code: "XLM" },
        },
      },
    },
    protocols: {
      bars: [
        {
          protocol: "Soroswap",
          opCount: 600,
          share: 66.66666666666667,
          rank: 1,
          entityCount: 3,
        },
        {
          protocol: "Blend",
          opCount: 200,
          share: 22.22222222222222,
          rank: 2,
          entityCount: 2,
        },
        {
          protocol: "Aquarius",
          opCount: 100,
          share: 11.11111111111111,
          rank: 3,
          entityCount: 1,
        },
      ],
      totalOps: 900,
      labeledOps: 900,
      coverage: 100,
      unknownCount: 0,
    },
    metricProvenance: buildActivityMetricProvenance(),
  };
}

describe("parseDappsQuery", () => {
  test("defaults to 1d and no limit", () => {
    assert.deepEqual(parseDappsQuery(new URLSearchParams()), {
      ok: true,
      period: "1d",
    });
  });

  test("accepts every supported period", () => {
    for (const period of supportedPeriods) {
      assert.deepEqual(parseDappsQuery(new URLSearchParams({ period })), {
        ok: true,
        period,
      });
    }
  });

  test("rejects unsupported periods with the supported list", () => {
    const result = parseDappsQuery(new URLSearchParams({ period: "1y" }));
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.ok === false ? result.body : null,
      {
        code: "INVALID_PERIOD",
        message: "Unsupported dapps period.",
        supported: supportedPeriods,
      },
    );
  });

  test("accepts a limit inside bounds and rejects out-of-bounds values", () => {
    assert.deepEqual(parseDappsQuery(new URLSearchParams({ limit: "3" })), {
      ok: true,
      period: "1d",
      limit: 3,
    });

    for (const limit of ["0", "101", "2.5", "abc", ""]) {
      const result = parseDappsQuery(new URLSearchParams({ limit }));
      assert.equal(result.ok, false, `limit "${limit}" must be rejected`);
      assert.equal(
        result.ok === false ? result.body.code : null,
        "INVALID_LIMIT",
      );
    }
  });
});

describe("GET /api/v1/dapps", () => {
  test("returns a ranked leaderboard for every period", async () => {
    for (const period of supportedPeriods) {
      const response = await handleDappsRequest(
        new Request(`http://localhost/api/v1/dapps?period=${period}`),
        async (requested) => mockActivityDataset(requested),
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.period, period);
      assert.equal(body.metric, "operation_count");
      assert.equal(body.sort, DAPPS_SORT);
      assert.deepEqual(
        body.entries.map((entry: { protocol: string }) => entry.protocol),
        ["Soroswap", "Blend", "Aquarius"],
      );
      assert.deepEqual(
        body.entries.map((entry: { rank: number }) => entry.rank),
        [1, 2, 3],
      );
      assert.equal(body.totalOps, 900);
      assert.equal(body.entries[0].opCount, 600);
    }
  });

  test("sorts by operation count descending and keeps ranks contiguous when limited", async () => {
    const response = await handleDappsRequest(
      new Request("http://localhost/api/v1/dapps?period=30d&limit=2"),
      async (period) => mockActivityDataset(period),
    );
    const body = await response.json();

    assert.equal(body.entries.length, 2);
    assert.deepEqual(
      body.entries.map((entry: { rank: number }) => entry.rank),
      [1, 2],
    );
    assert.ok(body.entries[0].opCount > body.entries[1].opCount);
  });

  test("returns an empty ranking when no protocol has operations", async () => {
    const response = await handleDappsRequest(
      new Request("http://localhost/api/v1/dapps?period=30d"),
      async (period) => {
        const dataset = mockActivityDataset(period);
        return {
          ...dataset,
          protocols: {
            bars: [],
            totalOps: 0,
            labeledOps: 0,
            coverage: 0,
            unknownCount: 0,
          },
        };
      },
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.entries, []);
    assert.equal(body.totalOps, 0);
    assert.equal(body.coverage, 0);
  });

  test("rebuilds the ranking from raw rows when the dataset has no summary", async () => {
    const response = await handleDappsRequest(
      new Request("http://localhost/api/v1/dapps?period=7d"),
      async (period) => {
        const dataset = mockActivityDataset(period);
        return {
          ...dataset,
          protocols: undefined,
          accounts: [
            { account_id: "GABC", type_string: "payment", op_count: 10 },
            { account_id: "GDEF", type_string: "payment", op_count: 5 },
          ],
          contracts: [{ contract_id: "CXYZ", op_count: 20 }],
        };
      },
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.totalOps, 35);
    assert.ok(body.entries.length > 0);
    assert.deepEqual(
      body.entries.map((entry: { rank: number }) => entry.rank),
      body.entries.map((_: unknown, index: number) => index + 1),
    );
  });

  test("falls back to the period end when the freshness watermark is empty", async () => {
    const response = await handleDappsRequest(
      new Request("http://localhost/api/v1/dapps?period=30d"),
      async (period) => {
        const dataset = mockActivityDataset(period);
        return { ...dataset, sourceTimestamp: "" };
      },
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.sourceTimestamp, body.end);
  });

  test("returns 400 for invalid queries without invoking the provider", async () => {
    for (const query of ["period=1y", "limit=0"]) {
      let calls = 0;
      const response = await handleDappsRequest(
        new Request(`http://localhost/api/v1/dapps?${query}`),
        async (period) => {
          calls += 1;
          return mockActivityDataset(period);
        },
      );

      assert.equal(response.status, 400);
      assert.equal(calls, 0);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  });

  test("returns a safe provider error response", async () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const response = await handleDappsRequest(
        new Request("http://localhost/api/v1/dapps?period=30d"),
        async () => {
          throw new Error("BigQuery query failed with backend detail");
        },
      );

      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      });
      assert.equal(response.headers.get("cache-control"), "no-store");
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("exports the route handler", () => {
    assert.equal(typeof GET, "function");
  });
});
