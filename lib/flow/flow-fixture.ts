import fixture from "@/data/fixtures/flow-edges.json";
import { getDisplayName } from "@/lib/entities/registry";
import { resolvePeriod } from "@/lib/periods";
import type { Period } from "@/lib/types";

import { buildFlowGraph } from "./build-graph";
import type { FlowEdgeRow, FlowGraphResponse } from "./types";

interface FlowFixtureFile {
  description?: string;
  period: Period;
  start: string;
  end: string;
  rows: FlowEdgeRow[];
}

const stored = fixture as FlowFixtureFile;

/**
 * Builds a Flow graph response from the committed fixture rows.
 *
 * Fixture mode is for local development and tests only: it performs no network
 * calls and needs no GCP credentials, but it still runs the rows through the
 * real `buildFlowGraph` so the rendering pipeline is exercised end to end.
 *
 * The rows are period-agnostic, so a period other than the fixture's own period
 * reuses them while the reported window follows the requested period.
 */
export function getFixtureFlowGraph(
  period: Period = stored.period,
  now = new Date(stored.end),
): FlowGraphResponse {
  const range = resolvePeriod(period, now);

  return {
    period,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    source: "fixture",
    graph: buildFlowGraph(stored.rows, {
      resolveLabel: (id) => getDisplayName(id),
    }),
  };
}
