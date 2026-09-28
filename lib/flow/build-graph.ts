import type { AssetIdentity } from "@/lib/types";

import {
  FLOW_OPERATION_TYPES,
  NATIVE_ASSET_KEY,
  type FlowAssetKey,
  type FlowEdge,
  type FlowEdgeRow,
  type FlowGraph,
  type FlowGraphCoverage,
  type FlowNode,
  type FlowNodeMetrics,
  type FlowOperationType,
} from "./types";

const NATIVE_ASSET: AssetIdentity = { type: "native", code: "XLM" };

const FLOW_TYPES: ReadonlySet<string> = new Set<string>(FLOW_OPERATION_TYPES);

/** Canonical key for an asset; used to keep edge amounts asset-scoped. */
export function assetKeyOf(asset: AssetIdentity): FlowAssetKey {
  return asset.type === "native" ? NATIVE_ASSET_KEY : `issued:${asset.code}:${asset.issuer}`;
}

/**
 * Amounts travel as integer minor-unit strings (stroops). Parsing uses BigInt
 * so aggregation never loses precision and never crosses into float math.
 */
function parseAmount(raw: string | null | undefined): bigint {
  if (raw === null || raw === undefined) return BigInt(0);
  const trimmed = String(raw).trim();
  if (trimmed === "") return BigInt(0);
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`Flow edge amount must be an integer string, received "${raw}".`);
  }
  return BigInt(trimmed);
}

function isFlowOperation(type: string): type is FlowOperationType {
  return FLOW_TYPES.has(type);
}

/** `GABC...WXYZ` → `GABC…WXYZ` for compact node labels. */
export function shortenAccountId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export type FlowNodeLabel = {
  label: string;
  category?: string;
};

export type BuildFlowGraphOptions = {
  /** Maximum number of edges to return (top-N sampling). */
  topN?: number;
  /** Resolves an account id to a display label; falls back to a short id. */
  resolveLabel?: (id: string) => string | FlowNodeLabel | undefined;
};

type AggregatedEdge = {
  id: string;
  source: string;
  destination: string;
  assetKey: FlowAssetKey;
  asset: AssetIdentity;
  amount: bigint;
  operationCount: number;
};

function emptyMetrics(): FlowNodeMetrics {
  return {
    inOperationCount: 0,
    outOperationCount: 0,
    inDegree: 0,
    outDegree: 0,
    inVolumeByAsset: {},
    outVolumeByAsset: {},
  };
}

function addVolume(
  target: Record<FlowAssetKey, string>,
  assetKey: FlowAssetKey,
  amount: bigint,
): void {
  const current = target[assetKey];
  target[assetKey] = ((current ? BigInt(current) : BigInt(0)) + amount).toString();
}

/**
 * Builds a directed payment-flow graph from raw edge rows.
 *
 * Guarantees (see the payment-edge methodology):
 * - Only methodology-defined operation types become edges; failed operations,
 *   self-payments and rows missing either endpoint are dropped.
 * - Parallel edges between the same ordered pair are collapsed **per asset**:
 *   amounts are summed within an asset and never across assets.
 * - Sampling is top-N by operation count, then by amount **within the same
 *   asset** — amounts of different assets are never compared.
 */
export function buildFlowGraph(
  rows: readonly FlowEdgeRow[],
  options: BuildFlowGraphOptions = {},
): FlowGraph {
  const { topN, resolveLabel } = options;

  const aggregated = new Map<string, AggregatedEdge>();

  for (const row of rows ?? []) {
    const source = row?.source?.trim();
    const destination = row?.destination?.trim();

    if (!source || !destination) continue;
    if (source === destination) continue;
    if (row.successful === false) continue;
    if (!isFlowOperation(row.type_string)) continue;

    const asset = row.asset ?? NATIVE_ASSET;
    const assetKey = assetKeyOf(asset);
    const amount = parseAmount(row.amount);
    const operationCount = row.operationCount ?? 1;

    const key = `${source}->${destination}|${assetKey}`;
    const existing = aggregated.get(key);

    if (existing) {
      existing.amount += amount;
      existing.operationCount += operationCount;
      continue;
    }

    aggregated.set(key, {
      id: key,
      source,
      destination,
      assetKey,
      asset,
      amount,
      operationCount,
    });
  }

  const all = [...aggregated.values()];

  all.sort((a, b) => {
    if (b.operationCount !== a.operationCount) {
      return b.operationCount - a.operationCount;
    }
    // Group by asset before comparing amounts so cross-asset values are never
    // ordered against each other.
    if (a.assetKey !== b.assetKey) {
      return a.assetKey < b.assetKey ? -1 : 1;
    }
    if (a.amount !== b.amount) {
      return a.amount > b.amount ? -1 : 1;
    }
    return a.id < b.id ? -1 : 1;
  });

  const selected = topN === undefined ? all : all.slice(0, Math.max(0, topN));

  const edges: FlowEdge[] = selected.map((edge) => ({
    id: edge.id,
    source: edge.source,
    destination: edge.destination,
    assetKey: edge.assetKey,
    asset: edge.asset,
    amount: edge.amount.toString(),
    operationCount: edge.operationCount,
  }));

  const metricsById = new Map<string, FlowNodeMetrics>();
  const counterpartiesIn = new Map<string, Set<string>>();
  const counterpartiesOut = new Map<string, Set<string>>();

  const ensureMetrics = (id: string): FlowNodeMetrics => {
    let metrics = metricsById.get(id);
    if (!metrics) {
      metrics = emptyMetrics();
      metricsById.set(id, metrics);
    }
    return metrics;
  };

  for (const edge of selected) {
    const outMetrics = ensureMetrics(edge.source);
    const inMetrics = ensureMetrics(edge.destination);

    outMetrics.outOperationCount += edge.operationCount;
    inMetrics.inOperationCount += edge.operationCount;

    addVolume(outMetrics.outVolumeByAsset, edge.assetKey, BigInt(edge.amount));
    addVolume(inMetrics.inVolumeByAsset, edge.assetKey, BigInt(edge.amount));

    let outPeers = counterpartiesOut.get(edge.source);
    if (!outPeers) {
      outPeers = new Set<string>();
      counterpartiesOut.set(edge.source, outPeers);
    }
    outPeers.add(edge.destination);

    let inPeers = counterpartiesIn.get(edge.destination);
    if (!inPeers) {
      inPeers = new Set<string>();
      counterpartiesIn.set(edge.destination, inPeers);
    }
    inPeers.add(edge.source);
  }

  const nodes: FlowNode[] = [...metricsById.entries()].map(([id, metrics]) => {
    const resolved = resolveLabel?.(id);
    const resolvedLabel =
      typeof resolved === "string" ? resolved : (resolved?.label ?? undefined);
    const category = typeof resolved === "string" ? undefined : resolved?.category;

    const metricsWithDegrees: FlowNodeMetrics = {
      ...metrics,
      inDegree: counterpartiesIn.get(id)?.size ?? 0,
      outDegree: counterpartiesOut.get(id)?.size ?? 0,
    };

    const node: FlowNode = {
      id,
      label: resolvedLabel && resolvedLabel.trim() !== "" ? resolvedLabel : shortenAccountId(id),
      metrics: metricsWithDegrees,
    };

    if (category) {
      node.category = category;
    }

    return node;
  });

  nodes.sort((a, b) => {
    const totalA = a.metrics.inOperationCount + a.metrics.outOperationCount;
    const totalB = b.metrics.inOperationCount + b.metrics.outOperationCount;
    if (totalB !== totalA) return totalB - totalA;
    return a.id < b.id ? -1 : 1;
  });

  const totalOperationCount = all.reduce((sum, edge) => sum + edge.operationCount, 0);
  const operationCount = selected.reduce((sum, edge) => sum + edge.operationCount, 0);

  const coverage: FlowGraphCoverage = {
    edgeCount: edges.length,
    totalEdgeCount: all.length,
    sampled: all.length > edges.length,
    operationCount,
    totalOperationCount,
  };

  return { nodes, edges, coverage };
}
