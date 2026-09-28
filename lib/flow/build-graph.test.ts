import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assetKeyOf, buildFlowGraph, shortenAccountId } from "./build-graph";
import { getFixtureFlowGraph } from "./flow-fixture";
import { NATIVE_ASSET_KEY, type FlowEdgeRow } from "./types";

const USDC = {
  type: "issued",
  code: "USDC",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
} as const;

const A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const B = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const C = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

const payment = (overrides: Partial<FlowEdgeRow> = {}): FlowEdgeRow => ({
  source: A,
  destination: B,
  type_string: "payment",
  amount: "100",
  operationCount: 1,
  ...overrides,
});

describe("assetKeyOf", () => {
  it("keys native XLM and issued assets distinctly", () => {
    assert.equal(assetKeyOf({ type: "native", code: "XLM" }), NATIVE_ASSET_KEY);
    assert.equal(assetKeyOf(USDC), `issued:USDC:${USDC.issuer}`);
  });
});

describe("buildFlowGraph", () => {
  it("collapses parallel edges of the same asset into one edge", () => {
    const graph = buildFlowGraph([
      payment({ amount: "100", operationCount: 2 }),
      payment({ amount: "250", operationCount: 3 }),
    ]);

    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].amount, "350");
    assert.equal(graph.edges[0].operationCount, 5);
  });

  it("keeps assets separate and never sums across them", () => {
    const graph = buildFlowGraph([
      payment({ amount: "100", operationCount: 1 }),
      payment({ amount: "900", operationCount: 4, asset: USDC }),
    ]);

    assert.equal(graph.edges.length, 2);

    const native = graph.edges.find((edge) => edge.assetKey === NATIVE_ASSET_KEY);
    const usdc = graph.edges.find((edge) => edge.assetKey === assetKeyOf(USDC));

    assert.equal(native?.amount, "100");
    assert.equal(native?.operationCount, 1);
    assert.equal(usdc?.amount, "900");
    assert.equal(usdc?.operationCount, 4);
  });

  it("deduplicates nodes shared by multiple edges", () => {
    const graph = buildFlowGraph([
      payment({ destination: B, amount: "10" }),
      payment({ destination: C, amount: "10" }),
      payment({ source: B, destination: C, amount: "10" }),
    ]);

    const ids = graph.nodes.map((node) => node.id);
    assert.deepEqual([...new Set(ids)].sort(), ids.slice().sort());
    assert.equal(graph.nodes.length, 3);
  });

  it("drops failed operations, self-payments and non-payment types", () => {
    const graph = buildFlowGraph([
      payment({ amount: "100" }),
      payment({ amount: "999", successful: false }),
      payment({ source: B, destination: B, amount: "999" }),
      payment({ amount: "999", type_string: "manage_sell_offer" }),
      payment({ source: "", amount: "999" }),
      payment({ destination: "   ", amount: "999" }),
    ]);

    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].amount, "100");
  });

  it("includes funding (create_account) and drain (account_merge) edges", () => {
    const graph = buildFlowGraph([
      payment({ type_string: "create_account", amount: "10000000" }),
      payment({ source: B, destination: A, type_string: "account_merge", amount: "500" }),
    ]);

    assert.equal(graph.edges.length, 2);
    assert.equal(
      graph.edges.every((edge) => edge.assetKey === NATIVE_ASSET_KEY),
      true,
    );
  });

  it("defaults missing assets to native XLM and missing amounts to zero", () => {
    const graph = buildFlowGraph([payment({ amount: null })]);

    assert.equal(graph.edges[0].assetKey, NATIVE_ASSET_KEY);
    assert.equal(graph.edges[0].amount, "0");
  });

  it("aggregates large amounts without float precision loss", () => {
    const graph = buildFlowGraph([
      payment({ amount: "9007199254740993" }),
      payment({ amount: "1" }),
    ]);

    assert.equal(graph.edges[0].amount, "9007199254740994");
  });

  it("throws when an amount is not an integer string", () => {
    assert.throws(() => buildFlowGraph([payment({ amount: "1.5" })]), /integer string/);
  });

  it("tracks node degrees and per-asset volume", () => {
    const graph = buildFlowGraph([
      payment({ destination: B, amount: "100" }),
      payment({ destination: C, amount: "200" }),
      payment({ source: B, destination: A, amount: "50", asset: USDC }),
    ]);

    const nodeA = graph.nodes.find((node) => node.id === A);
    assert.ok(nodeA);
    assert.equal(nodeA.metrics.outDegree, 2);
    assert.equal(nodeA.metrics.outOperationCount, 2);
    assert.equal(nodeA.metrics.outVolumeByAsset[NATIVE_ASSET_KEY], "300");
    assert.equal(nodeA.metrics.inOperationCount, 1);
    assert.equal(nodeA.metrics.inVolumeByAsset[assetKeyOf(USDC)], "50");
    assert.equal(nodeA.metrics.inDegree, 1);
  });

  it("samples top-N edges by operation count and reports coverage", () => {
    const graph = buildFlowGraph(
      [
        payment({ destination: B, amount: "10", operationCount: 1 }),
        payment({ destination: C, amount: "10", operationCount: 5 }),
        payment({ source: B, destination: C, amount: "10", operationCount: 3 }),
      ],
      { topN: 2 },
    );

    assert.equal(graph.edges.length, 2);
    assert.equal(graph.coverage.edgeCount, 2);
    assert.equal(graph.coverage.totalEdgeCount, 3);
    assert.equal(graph.coverage.sampled, true);
    assert.equal(graph.coverage.operationCount, 8);
    assert.equal(graph.coverage.totalOperationCount, 9);
  });

  it("reports coverage as unsampled when nothing is dropped", () => {
    const graph = buildFlowGraph([payment({ amount: "10" })], { topN: 5 });

    assert.equal(graph.coverage.sampled, false);
    assert.equal(graph.coverage.edgeCount, graph.coverage.totalEdgeCount);
  });

  it("resolves node labels and falls back to a shortened account id", () => {
    const graph = buildFlowGraph([payment({ amount: "10" })], {
      resolveLabel: (id) => (id === A ? "Exchange" : undefined),
    });

    const nodeA = graph.nodes.find((node) => node.id === A);
    const nodeB = graph.nodes.find((node) => node.id === B);

    assert.equal(nodeA?.label, "Exchange");
    assert.equal(nodeB?.label, shortenAccountId(B));
  });

  it("returns an empty graph for empty input", () => {
    const graph = buildFlowGraph([]);

    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
    assert.equal(graph.coverage.totalEdgeCount, 0);
  });
});

describe("getFixtureFlowGraph", () => {
  it("renders a small cluster with no credentials", () => {
    const response = getFixtureFlowGraph();

    assert.equal(response.source, "fixture");
    assert.ok(response.graph.nodes.length >= 3);
    assert.ok(response.graph.edges.length >= 3);
    assert.equal(response.graph.coverage.sampled, false);
  });

  it("collapses the fixture's parallel XLM payments into one edge", () => {
    const response = getFixtureFlowGraph();
    const nativeEdge = response.graph.edges.find(
      (edge) => edge.assetKey === NATIVE_ASSET_KEY && edge.operationCount === 20,
    );

    assert.ok(nativeEdge);
    assert.equal(nativeEdge.amount, "2000000000");
  });

  it("keeps the fixture's USDC edge separate from XLM", () => {
    const response = getFixtureFlowGraph();
    const usdcEdge = response.graph.edges.find((edge) => edge.assetKey === assetKeyOf(USDC));

    assert.ok(usdcEdge);
    assert.equal(usdcEdge.amount, "4500000000");
  });

  it("excludes the fixture's failed, self, and non-payment rows", () => {
    const response = getFixtureFlowGraph();

    assert.equal(
      response.graph.edges.some((edge) => edge.source === edge.destination),
      false,
    );
    assert.equal(
      response.graph.edges.some((edge) => edge.operationCount === 4 && edge.amount === "9000000000"),
      false,
    );
  });
});
