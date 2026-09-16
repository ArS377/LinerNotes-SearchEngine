// Regression: ISSUE-002, Chrome QA 2026-09-16. See outputs/qa-report-2026-09-16.md.
import test from "node:test";
import assert from "node:assert/strict";
import { cached, resetCacheForTests } from "../src/services/cache.js";
import { retrieveCandidates } from "../src/discovery.js";

test("degraded results do not poison retries, healthy results remain cached", async () => {
  resetCacheForTests();
  let calls = 0;
  const load = async () => ({ providerStatus: ++calls === 1 ? "unavailable" : "ok" });
  const options = { shouldCache: (value) => value.providerStatus === "ok" };
  assert.equal((await cached("qa-retry", load, options)).providerStatus, "unavailable");
  assert.equal((await cached("qa-retry", load, options)).providerStatus, "ok");
  await cached("qa-retry", load, options);
  assert.equal(calls, 2);
});

test("failed genre research is not mislabeled as missing metadata", async () => {
  for (const status of ["partial", "unavailable", "insufficient-metadata"]) {
    const result = await retrieveCandidates({ genreResearch: { selected: [], status } }, { focus: "balanced" }, { local: [] });
    assert.equal(result.providerStatus, status === "insufficient-metadata" ? status : "unavailable");
  }
});
