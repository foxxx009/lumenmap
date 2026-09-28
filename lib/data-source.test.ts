import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSuggestFixtureMode,
  isFixtureMode,
  isProductionRuntime,
  resolveDataSource,
} from "@/lib/data-source";

describe("resolveDataSource", () => {
  it("defaults to live", () => {
    assert.equal(resolveDataSource({}), "live");
    assert.equal(resolveDataSource({ LUMENMAP_DATA_SOURCE: "live" }), "live");
  });

  it("accepts fixture outside production", () => {
    assert.equal(
      resolveDataSource({ LUMENMAP_DATA_SOURCE: "fixture", NODE_ENV: "development" }),
      "fixture",
    );
    assert.equal(
      isFixtureMode({ LUMENMAP_DATA_SOURCE: "fixture", NODE_ENV: "test" }),
      true,
    );
  });

  it("blocks fixture mode in production runtimes", () => {
    assert.throws(
      () =>
        resolveDataSource({
          LUMENMAP_DATA_SOURCE: "fixture",
          NODE_ENV: "production",
        }),
      /not allowed in production/,
    );
    assert.throws(
      () =>
        resolveDataSource({
          LUMENMAP_DATA_SOURCE: "fixture",
          VERCEL_ENV: "production",
        }),
      /not allowed in production/,
    );
  });

  it("rejects unknown values", () => {
    assert.throws(
      () => resolveDataSource({ LUMENMAP_DATA_SOURCE: "mock" }),
      /Unknown LUMENMAP_DATA_SOURCE/,
    );
  });
});

describe("isProductionRuntime", () => {
  it("is true for production node and vercel runtimes", () => {
    assert.equal(isProductionRuntime({ NODE_ENV: "production" }), true);
    assert.equal(isProductionRuntime({ VERCEL_ENV: "production" }), true);
  });

  it("is false for local development and test runtimes", () => {
    assert.equal(isProductionRuntime({ NODE_ENV: "development" }), false);
    assert.equal(isProductionRuntime({ NODE_ENV: "test" }), false);
    assert.equal(isProductionRuntime({ VERCEL_ENV: "preview" }), false);
    assert.equal(isProductionRuntime({}), false);
  });
});

describe("canSuggestFixtureMode", () => {
  it("allows the fixture suggestion outside production", () => {
    assert.equal(canSuggestFixtureMode({ NODE_ENV: "development" }), true);
    assert.equal(canSuggestFixtureMode({ NODE_ENV: "test" }), true);
    assert.equal(canSuggestFixtureMode({ VERCEL_ENV: "preview" }), true);
    assert.equal(canSuggestFixtureMode({}), true);
  });

  it("never allows the fixture suggestion in production", () => {
    assert.equal(canSuggestFixtureMode({ NODE_ENV: "production" }), false);
    assert.equal(canSuggestFixtureMode({ VERCEL_ENV: "production" }), false);
    assert.equal(
      canSuggestFixtureMode({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
      false,
    );
  });
});

