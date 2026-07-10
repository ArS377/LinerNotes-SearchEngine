import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cached, cacheStatus, rateLimit, resetCacheForTests } from "../src/services/cache.js";

beforeEach(resetCacheForTests);

test("caches and coalesces identical work", async () => {
  let calls = 0;
  const loader = async () => ({ call: ++calls });
  const [first, second] = await Promise.all([
    cached("same", loader),
    cached("same", loader)
  ]);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
  assert.equal(cacheStatus().hits, 0);
  assert.deepEqual(await cached("same", loader), first);
  assert.equal(cacheStatus().hits, 1);
});

test("enforces an in-memory rate limit without Redis", async () => {
  assert.equal((await rateLimit("user", { limit: 2 })).allowed, true);
  assert.equal((await rateLimit("user", { limit: 2 })).allowed, true);
  assert.equal((await rateLimit("user", { limit: 2 })).allowed, false);
});
