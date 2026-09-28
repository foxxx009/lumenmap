import { z } from "zod";

import {
  dataSourceSchema,
  isoTimestampSchema,
  periodSchema,
} from "./activity-response";

/** Ranking metric exposed by `GET /api/v1/dapps`. */
export const DAPPS_METRIC = "operation_count" as const;

/**
 * Documented sort order: operation count descending, protocol name ascending
 * for ties. Deterministic so clients can rely on stable pagination/rank output.
 */
export const DAPPS_SORT = "opCount:desc,protocol:asc" as const;

export const dappLeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  protocol: z.string().min(1),
  opCount: z.number().finite().nonnegative(),
  /** Share of total ranked operations, in percent. */
  share: z.number().finite().nonnegative(),
  entityCount: z.number().int().nonnegative(),
});

export const dappLeaderboardSchema = z.object({
  period: periodSchema,
  start: isoTimestampSchema,
  end: isoTimestampSchema,
  source: dataSourceSchema,
  sourceTimestamp: isoTimestampSchema,
  isPeriodComplete: z.boolean(),
  metric: z.literal(DAPPS_METRIC),
  totalOps: z.number().finite().nonnegative(),
  labeledOps: z.number().finite().nonnegative(),
  /** Percentage of ranked operations that carry a known protocol label. */
  coverage: z.number().finite().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  entries: z.array(dappLeaderboardEntrySchema),
  sort: z.literal(DAPPS_SORT),
  /** Present and true when the response was served from static fixture data. */
  fixture: z.boolean().optional(),
});

export type DappLeaderboardEntry = z.infer<typeof dappLeaderboardEntrySchema>;
export type DappLeaderboard = z.infer<typeof dappLeaderboardSchema>;
