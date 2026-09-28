import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  COMPLETE_SHARED_TTL_SECONDS,
  IN_PROGRESS_SHARED_TTL_SECONDS,
  MAX_SHARED_TTL_SECONDS,
  NO_STORE_HEADERS,
  activityCacheHeaders,
} from "./cache-headers";

describe("activityCacheHeaders", () => {
  test("gives in-progress periods a shorter shared TTL than complete periods", () => {
    const inProgress = activityCacheHeaders({ isPeriodComplete: false });
    const complete = activityCacheHeaders({ isPeriodComplete: true });

    assert.equal(
      inProgress["Cache-Control"],
      `public, max-age=${IN_PROGRESS_SHARED_TTL_SECONDS}, s-maxage=${IN_PROGRESS_SHARED_TTL_SECONDS}`,
    );
    assert.equal(
      complete["Cache-Control"],
      `public, max-age=${COMPLETE_SHARED_TTL_SECONDS}, s-maxage=${COMPLETE_SHARED_TTL_SECONDS}`,
    );
    assert.ok(
      IN_PROGRESS_SHARED_TTL_SECONDS < COMPLETE_SHARED_TTL_SECONDS,
      "today must be cached for less time than a closed period",
    );
  });

  test("mirrors the browser TTL onto both CDN control headers", () => {
    const headers = activityCacheHeaders({ isPeriodComplete: true });

    assert.equal(headers["CDN-Cache-Control"], headers["Cache-Control"]);
    assert.equal(headers["Vercel-CDN-Cache-Control"], headers["Cache-Control"]);
  });

  test("never exceeds the documented maximum shared TTL", () => {
    for (const isPeriodComplete of [true, false]) {
      const ttl = isPeriodComplete
        ? COMPLETE_SHARED_TTL_SECONDS
        : IN_PROGRESS_SHARED_TTL_SECONDS;
      assert.ok(ttl > 0);
      assert.ok(
        ttl <= MAX_SHARED_TTL_SECONDS,
        `shared TTL ${ttl} exceeds cap ${MAX_SHARED_TTL_SECONDS}`,
      );
    }
  });

  test("exposes a no-store policy for error responses", () => {
    assert.equal(NO_STORE_HEADERS["Cache-Control"], "no-store");
  });
});
