import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ACTIVITY_ERROR_CODES,
  ActivityRequestError,
  activityErrorCopy,
  activityRequestErrorFromBody,
  classifyActivityError,
  classifyUpstreamFailure,
  toPublicActivityError,
  type ActivityErrorCode,
} from "./activity-failures";

describe("classifyUpstreamFailure", () => {
  test("detects missing credentials", () => {
    const cases = [
      new Error(
        "BigQuery credentials are required. Set GOOGLE_APPLICATION_CREDENTIALS in .env.local",
      ),
      new Error("BigQuery credentials are not configured"),
      new Error("Could not load the default credentials"),
      new Error("invalid grant: invalid JWT signature"),
      new Error("Unable to authenticate with GCP_SERVICE_ACCOUNT_KEY"),
    ];

    for (const error of cases) {
      assert.equal(
        classifyUpstreamFailure(error),
        "CREDENTIALS_MISSING",
        `expected credentials class for: ${error.message}`,
      );
    }
  });

  test("detects upstream query failures when credentials already work", () => {
    const cases = [
      new Error("BigQuery query failed with backend detail"),
      new Error("Unrecognized name: op_type at [12:5]"),
      new Error("Not found: Table lumenmap:crypto_stellar.contracts"),
      new Error("Syntax error: unexpected end of input"),
      new Error("Permission denied while reading the dataset"),
      new Error("Query exceeded limit for bytes billed"),
    ];

    for (const error of cases) {
      assert.equal(
        classifyUpstreamFailure(error),
        "UPSTREAM_QUERY_FAILED",
        `expected query class for: ${error.message}`,
      );
    }
  });

  test("falls back to INTERNAL_ERROR for unknown failures", () => {
    for (const error of [
      new Error("socket hang up"),
      new Error(""),
      undefined,
      "plain string that says nothing useful",
    ]) {
      assert.equal(classifyUpstreamFailure(error), "INTERNAL_ERROR");
    }
  });

  test("credentials class wins when a message mentions both", () => {
    assert.equal(
      classifyUpstreamFailure(
        new Error(
          "BigQuery credentials are required before any query can be executed",
        ),
      ),
      "CREDENTIALS_MISSING",
    );
  });
});

describe("toPublicActivityError", () => {
  test("never leaks provider detail", () => {
    const body = toPublicActivityError(
      new Error("BigQuery permission denied on table secret-project.dataset"),
    );

    assert.equal(body.code, "UPSTREAM_QUERY_FAILED");
    assert.equal(body.message.includes("secret-project"), false);
  });

  test("always returns one of the documented codes", () => {
    for (const error of [
      new Error("boom"),
      new Error("credentials are required"),
      new Error("query failed"),
    ]) {
      const body = toPublicActivityError(error);
      assert.ok(
        (ACTIVITY_ERROR_CODES as readonly string[]).includes(body.code),
        `unexpected code ${body.code}`,
      );
      assert.ok(body.message.length > 0);
    }
  });
});

describe("ActivityRequestError", () => {
  test("carries the failure code through client classification", () => {
    const error = new ActivityRequestError(
      "UPSTREAM_QUERY_FAILED",
      "The upstream Hubble query failed. Retrying may help; credentials are configured.",
      500,
    );

    assert.equal(error instanceof Error, true);
    assert.equal(classifyActivityError(error), "UPSTREAM_QUERY_FAILED");
  });

  test("activityRequestErrorFromBody maps API codes and falls back safely", () => {
    const mapped = activityRequestErrorFromBody(
      { code: "CREDENTIALS_MISSING", message: "server message" },
      500,
    );
    assert.equal(mapped.code, "CREDENTIALS_MISSING");
    assert.equal(mapped.status, 500);

    const unknownCode = activityRequestErrorFromBody(
      { code: "SOMETHING_ELSE", message: "server message" },
      500,
    );
    assert.equal(unknownCode.code, "INTERNAL_ERROR");

    const empty = activityRequestErrorFromBody(null, 502);
    assert.equal(empty.code, "INTERNAL_ERROR");
    assert.equal(empty.message, "Failed to load activity data");

    const noMessage = activityRequestErrorFromBody({ code: "INTERNAL_ERROR" }, 500);
    assert.equal(noMessage.message, "Failed to load activity data");
  });

  test("non-API errors classify as INTERNAL_ERROR", () => {
    assert.equal(classifyActivityError(new Error("Failed to fetch")), "INTERNAL_ERROR");
    assert.equal(classifyActivityError(undefined), "INTERNAL_ERROR");
  });
});

describe("activityErrorCopy", () => {
  test("shows the credentials hint only for the credentials class", () => {
    const credentials = activityErrorCopy(
      new ActivityRequestError("CREDENTIALS_MISSING", "missing", 500),
    );
    assert.equal(credentials.showCredentialsHint, true);
    assert.ok(credentials.hint?.includes("GOOGLE_APPLICATION_CREDENTIALS"));

    for (const code of ["UPSTREAM_QUERY_FAILED", "INTERNAL_ERROR"] as const) {
      const copy = activityErrorCopy(
        new ActivityRequestError(code, "failed", 500),
      );
      assert.equal(copy.showCredentialsHint, false, `hint shown for ${code}`);
      assert.equal(
        copy.hint?.includes("GOOGLE_APPLICATION_CREDENTIALS") ?? false,
        false,
        `credentials hint leaked for ${code}`,
      );
    }
  });

  test("query-failed copy is retry oriented", () => {
    const copy = activityErrorCopy(
      activityRequestErrorFromBody({ code: "UPSTREAM_QUERY_FAILED" }, 500),
    );

    assert.equal(copy.retryable, true);
    assert.match(copy.hint ?? "", /retry/i);
    assert.match(copy.message, /query failed/i);
  });

  test("every code has complete copy", () => {
    for (const code of ACTIVITY_ERROR_CODES) {
      const copy: ReturnType<typeof activityErrorCopy> = activityErrorCopy(
        new ActivityRequestError(code as ActivityErrorCode, "m", 500),
      );
      assert.equal(copy.code, code);
      assert.ok(copy.title.length > 0);
      assert.ok(copy.message.length > 0);
    }
  });
});
