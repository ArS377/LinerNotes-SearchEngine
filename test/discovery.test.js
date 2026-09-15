import test from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, retrieveCandidates, discover, enrichSeedGenres, discoveryGenres } from "../src/discovery.js";
import { discoveryRequestSchema, trailSchema } from "../src/contracts/discovery.js";
import { researchGenres } from "../src/genre-research.js";

const profile = (selected) => ({ selected, entries: selected.map((name) => ({ name, recordingCount: 100, level: "recording" })), status: "ok" });
const seed = { slug: "seed", title: "Starting track", artist: "Seed Artist", genres: ["disco", "funk"], genreResearch: profile(["disco", "funk"]), releaseDate: "2013-01-01" };
const research = (track, artist) => researchGenres(track, artist, { catalog: async () => ["hip hop", "rage", "trap", "boom bap"], count: async (genre) => ({ "hip hop": 100000, rage: 100, trap: 20000, "boom bap": 100 })[genre] });
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
test("dismissed recordings cannot reappear under a second catalog identifier", () => {
  const items = [candidate("hidden"), candidate("alias", { title: "hidden", artist: "Artist hidden" }), candidate("ok")];
  assert.deepEqual(rankCandidates(seed, items, { ...options, excludeSlugs: ["hidden"] }).map((item) => item.slug), ["ok"]);
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
test("MMR reduces repetition from the same compilation", () => {
  const items = [candidate("a", { album: "Same compilation" }), candidate("b", { album: "Same compilation" }), candidate("c", { album: "Another album" })];
  assert.deepEqual(rankCandidates(seed, items, options).map((item) => item.slug), ["a", "c", "b"]);
});
test("unrelated tracks do not fill a short recommendation list", () => {
  assert.equal(rankCandidates(seed, [candidate("unrelated", { genres: ["classical"] })], options).length, 0);
  assert.equal(rankCandidates({ ...seed, genres: [], genreResearch: profile([]) }, [candidate("x")], options).length, 0);
});
test("genre punctuation and case normalize without genre-name overrides", () => {
  assert.equal(rankCandidates({ ...seed, genres: ["RAGE"], genreResearch: profile(["rage"]) }, [candidate("rap", { genres: ["rage"] })], options).length, 1);
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
  assert.equal(result.method, "catalog-research-mmr-v3");
  assert.equal(result.seed.title, seed.title);
  assert.match(result.items[0].reasons.join(" "), /2012/);
  assert.equal(result.weights.genre, 0.75);
});

test("Green Room uses the rage subgenre instead of broad hip hop or nearby years", () => {
  const greenRoom = { ...seed, title: "Green Room", artist: "Ken Carson", genres: ["Hip-Hop/Rap", "rage", "trap", "cloud rap"], genreResearch: profile(["rage"]), releaseDate: "2023" };
  const items = [candidate("generic", { genres: ["hip hop"], releaseDate: "2023" }), candidate("trap-only", { genres: ["trap"], releaseDate: "2023" }), candidate("rage-track", { artist: "Playboi Carti", genres: ["hip hop", "rage", "trap"], releaseDate: "2020" })];
  for (const focus of ["balanced", "genre"]) assert.deepEqual(rankCandidates(greenRoom, items, { ...options, focus }).map((item) => item.slug), ["rage-track"]);
  assert.deepEqual(discoveryGenres(greenRoom), ["rage"]);
});

test("broad-only metadata abstains instead of pretending all rap sounds similar", async () => {
  const broad = { ...seed, genres: ["Hip-Hop/Rap"], genreResearch: profile([]) };
  assert.deepEqual(rankCandidates(broad, [candidate("rap", { genres: ["hip hop"] })], options), []);
  const result = await retrieveCandidates(broad, options, { search: () => { throw new Error("should not search"); } });
  assert.equal(result.providerStatus, "insufficient-metadata");
});

test("seed enrichment uses an unambiguous artist fallback and labels its evidence", async () => {
  const broad = { ...seed, artist: "Ken Carson", genres: ["Hip-Hop/Rap"] };
  const enriched = await enrichSeedGenres(broad, { research, search: async () => ({ results: [] }), findArtists: async () => [{ id: "ken-id", name: "Ken Carson" }], artistMetadata: async () => ({ name: "Ken Carson", genres: ["hip hop", "rage", "trap"] }) });
  assert.deepEqual(discoveryGenres(enriched), ["rage"]);
  const result = rankCandidates(enriched, [candidate("rage", { genres: ["rage"] })], options)[0];
  assert.match(result.reasons[0], /artist-level/);
  assert.equal(result.evidence.seedGenreContext.url, "https://musicbrainz.org/artist/ken-id");
});

test("exact recording subgenres override artist-level fallback", async () => {
  const enriched = await enrichSeedGenres({ ...seed, genres: ["hip hop"] }, { research, search: async () => ({ results: [{ ...seed, genres: ["boom bap"] }] }), findArtists: async () => { throw new Error("no artist profile"); } });
  assert.deepEqual(discoveryGenres(enriched), ["boom bap"]);
});

test("ambiguous artist names and mismatched titles cannot inject subgenres", async () => {
  const broad = { ...seed, genres: ["hip hop"] };
  const enriched = await enrichSeedGenres(broad, { research, search: async () => ({ results: [{ ...seed, title: "Wrong song", genres: ["rage"] }] }), findArtists: async () => [{ id: "a", name: seed.artist }, { id: "b", name: seed.artist }], artistMetadata: async () => { throw new Error("ambiguous artist"); } });
  assert.deepEqual(enriched.genres, ["hip hop"]);
});

test("rage retrieval never expands back into all hip hop", async () => {
  let query;
  await retrieveCandidates({ ...seed, genres: ["hip hop", "rage", "trap"], genreResearch: profile(["rage"]) }, options, { local: [], search: async (q) => { query = q; return { results: [] }; } });
  assert.match(query, /tag:"rage"/);
  assert.doesNotMatch(query, /tag:"hip hop"|tag:"trap"/);
});

test("related-artist retrieval fills missing tags but preserves conflicting track styles", async () => {
  const result = await retrieveCandidates({ ...seed, genres: ["hip hop", "rage"], genreResearch: profile(["rage"]) }, options, {
    local: [], findArtists: async () => [{ id: "related", name: "Related Artist", genres: ["hip hop", "rage", "2020s"] }],
    search: async (query) => ({ results: query.startsWith("arid:") ? [candidate("untagged", { artist: "Related Artist", genres: [] }), candidate("different-style", { artist: "Related Artist", genres: ["boom bap"] }), candidate("wrong-credit", { genres: [] })] : [] })
  });
  assert.deepEqual(result.candidates.map((item) => item.slug), ["untagged"]);
  assert.deepEqual(result.candidates[0].genres, ["hip hop", "rage"]);
  assert.equal(result.candidates[0].genreContext.level, "artist");
});
test("requests and shared trails reject arbitrary URLs and unbounded input", () => {
  assert.equal(discoveryRequestSchema.safeParse({ seedSlug: "https://example.com" }).success, false);
  assert.equal(discoveryRequestSchema.safeParse({ seedSlug: "seed", limit: 100 }).success, false);
  assert.equal(discoveryRequestSchema.safeParse({ seedSlug: "seed", focus: "vocals" }).success, false);
  assert.equal(trailSchema.safeParse({ version: 1, steps: Array(11).fill("seed"), focus: "genre", differentArtists: true }).success, false);
});

test("album enrichment verifies album title and artist and preserves provenance", async () => {
  const albumSeed = { ...seed, genres: [], album: "New Direction" };
  const enriched = await enrichSeedGenres(albumSeed, {
    search: async () => ({ results: [] }), findArtists: async () => [],
    findAlbums: async () => [{ id: "album-id", title: "New Direction", artist: seed.artist }],
    albumMetadata: async () => ({ id: "album-id", title: "New Direction", artist: seed.artist, genres: ["boom bap"] }), research
  });
  assert.deepEqual(discoveryGenres(enriched), ["boom bap"]);
  assert.equal(enriched.genreContext.level, "album");
  assert.equal(enriched.genreContext.url, "https://musicbrainz.org/release-group/album-id");
});

test("album lookup outages do not silently substitute career-wide artist genres", async () => {
  const enriched = await enrichSeedGenres({ ...seed, album: "New Direction" }, {
    search: async () => ({ results: [] }), findArtists: async () => [],
    findAlbums: async () => { throw new Error("unavailable"); }, research: async () => profile(["disco"])
  });
  assert.deepEqual(discoveryGenres(enriched), []);
  assert.equal(enriched.genreResearch.status, "partial");
});
