import { createClient } from "redis";

const memory = new Map();
const inFlight = new Map();
let redisClient;
let redisFailed = false;
const metrics = { hits: 0, misses: 0, stale: 0, errors: 0 };

function redisUrl() {
  return process.env.REDIS_URL?.trim() || "";
}

async function client() {
  if (!redisUrl() || redisFailed) return null;
  if (!redisClient) {
    redisClient = createClient({ url: redisUrl() });
    redisClient.on("error", () => {
      metrics.errors += 1;
    });
    try {
      await redisClient.connect();
    } catch {
      redisFailed = true;
      redisClient = null;
    }
  }
  return redisClient;
}

function memoryGet(key, allowStale = false) {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt > Date.now()) return { value: entry.value, stale: false };
  if (allowStale && entry.staleUntil > Date.now()) return { value: entry.value, stale: true };
  memory.delete(key);
  return null;
}

export async function getCached(key, { allowStale = false } = {}) {
  const local = memoryGet(key, allowStale);
  if (local) {
    metrics[local.stale ? "stale" : "hits"] += 1;
    return local;
  }
  const remote = await client();
  if (remote) {
    try {
      const value = await remote.get(key);
      if (value) {
        metrics.hits += 1;
        return { value: JSON.parse(value), stale: false };
      }
    } catch {
      metrics.errors += 1;
    }
  }
  metrics.misses += 1;
  return null;
}

export async function setCached(key, value, { ttlSeconds = 300, staleSeconds = 900 } = {}) {
  memory.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1_000,
    staleUntil: Date.now() + (ttlSeconds + staleSeconds) * 1_000
  });
  const remote = await client();
  if (remote) {
    try {
      await remote.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch {
      metrics.errors += 1;
    }
  }
}

export async function cached(key, loader, options = {}) {
  const existing = await getCached(key);
  if (existing) return existing.value;
  if (inFlight.has(key)) return inFlight.get(key);
  const operation = Promise.resolve()
    .then(loader)
    .then(async (value) => {
      if (!options.shouldCache || options.shouldCache(value)) await setCached(key, value, options);
      return value;
    })
    .catch(async (error) => {
      const stale = await getCached(key, { allowStale: true });
      if (stale) return stale.value;
      throw error;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, operation);
  return operation;
}

export async function rateLimit(key, { limit = 20, windowSeconds = 60 } = {}) {
  const remote = await client();
  if (remote) {
    const count = await remote.incr(`rate:${key}`);
    if (count === 1) await remote.expire(`rate:${key}`, windowSeconds);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }
  const bucketKey = `rate:${key}`;
  const now = Date.now();
  const bucket = memory.get(bucketKey);
  const count = !bucket || bucket.expiresAt <= now ? 1 : bucket.value + 1;
  memory.set(bucketKey, { value: count, expiresAt: now + windowSeconds * 1_000, staleUntil: 0 });
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

export function cacheStatus() {
  return { configured: Boolean(redisUrl()), backend: redisUrl() ? "redis" : "memory", ...metrics };
}

export async function closeCache() {
  if (redisClient?.isOpen) await redisClient.quit();
  redisClient = undefined;
}

export function resetCacheForTests() {
  memory.clear();
  inFlight.clear();
  Object.assign(metrics, { hits: 0, misses: 0, stale: 0, errors: 0 });
}
