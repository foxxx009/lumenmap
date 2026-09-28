/**
 * Protocol leaderboard builders for `GET /api/v1/dapps`.
 *
 * The dashboard already receives a ranked protocol summary inside the activity
 * payload. This module projects that summary (or rebuilds it from the raw rows
 * when the summary is absent, e.g. fixture datasets) into a stable public
 * leaderboard shape.
 */

import { buildProtocolSummary } from "@/lib/entities/build-treemap";
import type { ActivityDataset } from "@/lib/types";
import {
  DAPPS_METRIC,
  DAPPS_SORT,
  type DappLeaderboard,
  type DappLeaderboardEntry,
} from "@/lib/schemas/dapps-response";

export interface DappLeaderboardOptions {
  /** Maximum number of entries to return. Omit for the full ranking. */
  limit?: number;
}

/**
 * Resolve the protocol summary for a dataset.
 *
 * Live datasets carry a pre-built summary that used network-resolved entity
 * labels. Fixture datasets do not carry one, so fall back to the same builder
 * fed with the raw rows - it resolves labels from the local entity registry, so
 * the fallback stays offline and deterministic.
 */
function resolveSummary(data: ActivityDataset) {
  if (data.protocols) return data.protocols;

  return buildProtocolSummary(data.accounts ?? [], data.contracts ?? []);
}

/**
 * Build the public leaderboard for an activity dataset.
 *
 * Sort order is the documented one: operation count descending, protocol name
 * ascending on ties. `buildProtocolSummary` already sorts that way; ranks are
 * recomputed here so a `limit` cannot leave gaps in the numbering.
 */
export function buildDappLeaderboard(
  data: ActivityDataset,
  options: DappLeaderboardOptions = {},
): DappLeaderboard {
  const summary = resolveSummary(data);
  const bars =
    typeof options.limit === "number"
      ? summary.bars.slice(0, Math.max(0, Math.min(options.limit, summary.bars.length)))
      : summary.bars;

  const entries: DappLeaderboardEntry[] = bars.map((bar, index) => ({
    rank: index + 1,
    protocol: bar.protocol,
    opCount: bar.opCount,
    share: bar.share,
    entityCount: bar.entityCount,
  }));

  return {
    period: data.period,
    start: data.start,
    end: data.end,
    source: data.source,
    // Live datasets can carry an empty watermark before the freshness query
    // resolves; fall back to the period end so the payload stays valid.
    sourceTimestamp: data.sourceTimestamp || data.end,
    isPeriodComplete: data.isPeriodComplete,
    metric: DAPPS_METRIC,
    totalOps: summary.totalOps,
    labeledOps: summary.labeledOps,
    coverage: summary.coverage,
    unknownCount: summary.unknownCount,
    entries,
    sort: DAPPS_SORT,
  };
}
