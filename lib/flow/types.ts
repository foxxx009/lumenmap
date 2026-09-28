import type { AssetIdentity, Period } from "@/lib/types";

/**
 * Canonical asset key for a flow edge.
 *
 * Edges are always grouped per asset: amounts are never summed across assets
 * (see `docs/methodology.md` payment-edge semantics), so every edge carries the
 * asset it is denominated in.
 */
export type FlowAssetKey = string;

/** Asset key for native XLM. */
export const NATIVE_ASSET_KEY: FlowAssetKey = "native:XLM";

/**
 * Operation types that constitute a payment-flow edge.
 *
 * Per the payment-edge methodology: payment, both path payment forms,
 * create_account (funding edge) and account_merge (drain edge). Operation
 * types outside this list are not edges and are dropped by the builder.
 */
export const FLOW_OPERATION_TYPES = [
  "payment",
  "path_payment_strict_send",
  "path_payment_strict_receive",
  "create_account",
  "account_merge",
] as const;

export type FlowOperationType = (typeof FLOW_OPERATION_TYPES)[number];

/**
 * A raw payment-flow row as returned by the (future) Hubble query.
 *
 * Amounts are integer minor units (stroops) serialized as strings so large
 * values survive JSON transport without float precision loss.
 */
export type FlowEdgeRow = {
  /** Source account of the operation. */
  source: string;
  /** Destination account of the operation. */
  destination: string;
  /** Hubble `type_string` for the operation. */
  type_string: string;
  /** Asset the amount is denominated in. Defaults to native XLM when absent. */
  asset?: AssetIdentity;
  /** Integer minor units (stroops) as a string. */
  amount?: string | null;
  /** Operations collapsed into this row (defaults to 1). */
  operationCount?: number;
  /** Failed operations are excluded from the graph when explicitly false. */
  successful?: boolean;
};

export type FlowNodeMetrics = {
  /** Operations arriving at this node. */
  inOperationCount: number;
  /** Operations leaving this node. */
  outOperationCount: number;
  /** Distinct incoming counterparties. */
  inDegree: number;
  /** Distinct outgoing counterparties. */
  outDegree: number;
  /** Incoming volume per asset key, in minor units. */
  inVolumeByAsset: Record<FlowAssetKey, string>;
  /** Outgoing volume per asset key, in minor units. */
  outVolumeByAsset: Record<FlowAssetKey, string>;
};

export type FlowNode = {
  /** Stellar account id (G...). */
  id: string;
  /** Human-readable label; falls back to a shortened account id. */
  label: string;
  /** Optional entity category (exchange, protocol, ...). */
  category?: string;
  metrics: FlowNodeMetrics;
};

export type FlowEdge = {
  /** Deterministic id: `<source>-><destination>|<assetKey>`. */
  id: string;
  source: string;
  destination: string;
  assetKey: FlowAssetKey;
  asset: AssetIdentity;
  /** Aggregated amount in minor units, summed for this asset only. */
  amount: string;
  /** Operations aggregated into this edge. */
  operationCount: number;
};

/**
 * Top-N sampling disclosure.
 *
 * The Flow view renders a sample of the period's edges, so the API reports how
 * much of the graph is represented.
 */
export type FlowGraphCoverage = {
  /** Edges returned after sampling. */
  edgeCount: number;
  /** Edges present before sampling. */
  totalEdgeCount: number;
  /** True when `totalEdgeCount` exceeded the requested `topN`. */
  sampled: boolean;
  /** Operations represented by the returned edges. */
  operationCount: number;
  /** Operations present before sampling. */
  totalOperationCount: number;
};

export type FlowGraph = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  coverage: FlowGraphCoverage;
};

export type FlowGraphSource = "fixture" | "hubble";

export type FlowGraphResponse = {
  period: Period;
  /** ISO timestamp for the start of the period. */
  start: string;
  /** ISO timestamp for the end of the period. */
  end: string;
  source: FlowGraphSource;
  graph: FlowGraph;
};
