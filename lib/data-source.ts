export type DataSourceMode = "live" | "fixture";

const FIXTURE_ENV = "LUMENMAP_DATA_SOURCE";

/**
 * Resolves the activity data source.
 * Fixture mode is opt-in only and never allowed in production runtimes.
 */
export function resolveDataSource(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): DataSourceMode {
  const raw = (env[FIXTURE_ENV] ?? "live").trim().toLowerCase();

  if (raw === "fixture") {
    if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
      throw new Error(
        `${FIXTURE_ENV}=fixture is not allowed in production. Fixture data is for local development and tests only.`,
      );
    }
    return "fixture";
  }

  if (raw === "live" || raw === "" || raw === "hubble") {
    return "live";
  }

  throw new Error(
    `Unknown ${FIXTURE_ENV}="${env[FIXTURE_ENV]}". Use "live" (default) or "fixture".`,
  );
}

export function isFixtureMode(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return resolveDataSource(env) === "fixture";
}

/**
 * True when the current runtime is a production deployment. `VERCEL_ENV` covers
 * preview/production deploys where `NODE_ENV` may not be set by the host.
 */
export function isProductionRuntime(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

/**
 * Whether the UI may suggest switching to fixture mode.
 *
 * Fixture data is fake. Telling a production visitor how to turn it on would be
 * worse than the failure it replaces, so this is false in every production
 * runtime (see `isProductionRuntime`). Next.js inlines `process.env.NODE_ENV` at
 * build time, so in a production build this branch is statically false.
 */
export function canSuggestFixtureMode(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return !isProductionRuntime(env);
}
