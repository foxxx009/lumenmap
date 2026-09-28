"use client";

import { FlaskConical } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { canSuggestFixtureMode } from "@/lib/data-source";

const CONTRIBUTING_FIXTURE_URL =
  "https://github.com/lumenmap/lumenmap/blob/main/CONTRIBUTING.md#fixture-mode-default-no-credentials-needed";

/**
 * Local onboarding hint shown when live activity data fails while the app runs
 * outside production.
 *
 * Contributors without GCP credentials hit a dead end today: every widget shows
 * a generic failure and nothing says "you can run the whole dashboard off
 * fixtures instead". This banner closes that gap.
 *
 * It renders nothing unless both are true:
 * - the activity request failed (`isError` from `DashboardProvider`)
 * - the runtime is not a production deployment (`canSuggestFixtureMode()`)
 *
 * Next.js inlines `process.env.NODE_ENV` at build time, so in a production
 * build `canSuggestFixtureMode()` is statically false and this banner never
 * reaches a real visitor. Fixture data is fake; it must never be presented to
 * production users as a fix.
 */
export function FixtureModeHint() {
  const { isError, error, refetch, isFetching } = useDashboard();

  if (!isError) {
    return null;
  }

  if (!canSuggestFixtureMode()) {
    return null;
  }

  const detail =
    error instanceof Error && error.message
      ? error.message
      : "The activity request did not return data.";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="fixture-mode-hint"
      className="flex flex-col gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-100 sm:flex-row sm:items-start"
    >
      <FlaskConical
        className="mt-0.5 h-4 w-4 shrink-0 text-sky-300"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p>
          <strong className="font-medium text-sky-200">
            Live data failed — you can keep working with fixture data.
          </strong>{" "}
          <span className="text-sky-100/80">{detail}</span>
        </p>
        <p className="text-sky-100/80">
          This is a local or preview environment, so you can switch the
          dashboard to the bundled sample dataset instead of configuring
          BigQuery:
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sky-100/80">
          <li>
            Add{" "}
            <code className="rounded bg-sky-950/60 px-1 py-0.5 font-mono text-xs text-sky-200">
              LUMENMAP_DATA_SOURCE=fixture
            </code>{" "}
            to <code className="font-mono text-xs">.env.local</code> (copy{" "}
            <code className="font-mono text-xs">.env.example</code> first).
          </li>
          <li>
            Restart the dev server — fixture mode is opt-in and blocked in
            production.
          </li>
          <li>
            Reload; responses will carry{" "}
            <code className="font-mono text-xs">fixture: true</code>.
          </li>
        </ol>
        <p className="text-xs text-sky-100/70">
          If you do want live numbers, the{" "}
          <a
            href={CONTRIBUTING_FIXTURE_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm text-sky-200 underline decoration-dotted underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            fixture vs live mode section of CONTRIBUTING
          </a>{" "}
          covers the GCP credential setup.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="self-start rounded-md border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-100 transition-colors hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isFetching ? "Retrying…" : "Retry live data"}
        </button>
      </div>
    </div>
  );
}
