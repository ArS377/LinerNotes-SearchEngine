import test from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, retrieveCandidates, discover } from "../src/discovery.js";
import { discoveryRequestSchema, trailSchema } from "../src/contracts/discovery.js";

const seed = { slug: "seed", title: "Starting track", artist: "Seed Artist", genres: ["disco", "funk"], releaseDate: "2013-01-01" };
const candidate = (slug, overrides = {}) => ({ slug, title: slug, artist: `Artist ${slug}`, genres: ["disco"], releaseDate: "2012-01-01", source: "MusicBrainz", ...overrides });
const options = { focus: "balanced", differentArtists: true, unfamiliarArtists: false, knownArtists: [], excludeSlugs: [], limit: 5 };

test("discovery weights change the result ordering", () => {
  const items = [candidate("tags", { genres: ["disco", "funk"], releaseDate: "1970" }), candidate("era", { releaseDate: "2013" })];
  assert.equal(rankCandidates(seed, items, { ...options, focus: "genre" })[0].slug, "tags");
  assert.equal(rankCandidates(seed, items, { ...options, focus: "era" })[0].slug, "era");
});
test("discovery excludes the seed, duplicate recordings, dismissed tracks and bookmarked artists", () => {
  const items = [seed, candidate("duplicate", { title: seed.title, artist: seed.artist }), candidate("hidden"), candidate("known", { artist: "Known Artist" }), candidate("ok"), candidate("ok-copy", { title: "ok", artist: "Artist ok" })];
  const result = rankCandidates(seed, items, { ...options, unfamiliarArtists: true, knownArtists: ["known artist"], excludeSlugs: ["hidden"] });
  assert.deepEqual(result.map((item) => item.slug), ["ok"]);
});
test("same-artist filtering is explicit and can be disabled", () => {
  const item = candidate("same", { artist: seed.artist });
  assert.equal(rankCandidates(seed, [item], options).length, 0);
  assert.equal(rankCandidates(seed, [item], { ...options, differentArtists: false }).length, 1);
});
test("MMR favors a different artist over an equally relevant repeat", () => {
  const items = [candidate("a", { artist: "Repeat" }), candidate("b", { artist: "Repeat" }), candidate("c")];
  assert.deepEqual(rankCandidates(seed, items, options).map((item) => item.slug), ["a", "c", "b"]);
});
test("missing metadata never produces invented dates or audio claims", () => {
  const result = rankCandidates(seed, [candidate("unknown", { releaseDate: null })], options)[0];
  assert.equal(result.components.era, 0);
  assert.equal(result.evidence.candidateYear, null);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /catalog tags/);
  assert.equal(rankCandidates(seed, [candidate("unknown", { releaseDate: null })], { ...options, focus: "era" }).length, 0);
});
test("unrelated tracks do not fill a short recommendation list", () => {
  assert.equal(rankCandidates(seed, [candidate("unrelated", { genres: ["classical"] })], options).length, 0);
  assert.equal(rankCandidates({ ...seed, genres: [] }, [candidate("x")], options).length, 0);
});
test("genre aliases normalize provider vocabulary", () => {
  assert.equal(rankCandidates({ ...seed, genres: ["Hip-Hop/Rap"] }, [candidate("rap", { genres: ["hip hop"] })], options).length, 1);
});
test("provider failure retains local candidates and reports degradation", async () => {
  const result = await retrieveCandidates(seed, options, { search: async () => { throw new Error("offline"); }, local: [candidate("local")] });
  assert.equal(result.providerStatus, "unavailable");
  assert.equal(result.candidates[0].slug, "local");
});
test("retrieval uses bounded tag queries, not title search disguised as recommendations", async () => {
  let query, limit;
  await retrieveCandidates(seed, options, { local: [], search: async (q, l) => { query = q; limit = l; return { results: [] }; } });
  assert.match(query, /tag:"disco"/);
  assert.match(query, /NOT artist:"Seed Artist"/);
  assert.equal(limit, 100);
});
test("discovery returns explanations and a canonical seed using injected providers", async () => {
  const result = await discover({ seedSlug: "seed" }, { resolveSeed: async () => seed, local: [], search: async () => ({ results: [candidate("one")] }), enrich: async (item) => item });
  assert.equal(result.method, "metadata-mmr-v1");
  assert.equal(result.seed.title, seed.title);
  assert.match(result.items[0].reasons.join(" "), /2012/);
  assert.equal(result.weights.genre, 0.75);
});
test("requests and shared trails reject arbitrary URLs and unbounded input", () => {
  assert.equal(discoveryRequestSchema.safeParse({ seedSlug: "https://example.com" }).success, false);
  assert.equal(discoveryRequestSchema.safeParse({ seedSlug: "seed", limit: 100 }).success, false);
  assert.equal(discoveryRequestSchema.safeParse({ seedSlug: "seed", focus: "vocals" }).success, false);
  assert.equal(trailSchema.safeParse({ version: 1, steps: Array(11).fill("seed"), focus: "genre", differentArtists: true }).success, false);
});
