import test from "node:test";
import assert from "node:assert/strict";
import { bookmarkDiscovery } from "../src/bookmark-discovery.js";
import { rankCandidates } from "../src/discovery.js";

const bookmark = (genre, index = 0) => ({ slug: `seed-${index}`, title: `Seed ${index}`, artist: `Artist ${index}`, genres: [genre], releaseDate: "2023" });
const candidate = (slug, genre, extra = {}) => ({ slug, title: slug, artist: slug, genres: [genre], releaseDate: "2023", ...extra });

for (const genre of ["rage", "shoegaze", "bebop", "bluegrass", "baroque", "dub techno", "new catalog genre"]) {
  test(`Insights uses discovery eligibility for ${genre}, not decade or popularity`, async () => {
    const saved = bookmark(genre);
    const result = await bookmarkDiscovery({ bookmarks: [saved] }, {
      discover: async (options) => {
        assert.equal(options.focus, "genre");
        assert.equal(options.differentArtists, true);
        assert.deepEqual(options.excludeSlugs, [saved.slug]);
        const seed = { ...saved, genreResearch: { selected: [genre], entries: [] } };
        const items = rankCandidates(seed, [candidate("match", genre), candidate("unrelated", "pop", { prominence: 100 }), candidate("broad-only", "hip hop")], options);
        return { items, providerStatus: "ok" };
      }
    });
    assert.deepEqual(result.recommendations.map((item) => item.slug), ["match"]);
    assert.match(result.recommendations[0].reason, new RegExp(genre));
  });
}

test("empty bookmarks never query providers or return featured fillers", async () => {
  const result = await bookmarkDiscovery({}, { discover: () => assert.fail("no lookup") });
  assert.equal(result.status, "empty");
  assert.deepEqual(result.recommendations, []);
});

test("provider outage preserves valid matches and signals incomplete results", async () => {
  const result = await bookmarkDiscovery({ bookmarks: [bookmark("rage"), bookmark("jazz", 1)] }, {
    discover: async ({ seedSlug }) => {
      if (seedSlug === "seed-0") throw new Error("offline");
      return { providerStatus: "ok", items: [{ ...candidate("match", "jazz"), evidence: { genres: ["jazz"] }, components: { genre: 1 }, reasons: ["Shares jazz catalog tags."], score: 1 }] };
    }
  });
  assert.equal(result.status, "partial");
  assert.equal(result.recommendations.length, 1);
});

test("merging removes duplicate recordings and bookmark aliases", async () => {
  const saved = bookmark("rage");
  const match = { ...candidate("match", "rage"), evidence: { genres: ["rage"] }, components: { genre: 1 }, reasons: ["Shares rage."], score: 1 };
  const result = await bookmarkDiscovery({ bookmarks: [saved, bookmark("rage", 1)] }, {
    discover: async () => ({ providerStatus: "ok", items: [match, { ...match, slug: "alias" }, { ...match, slug: "saved-alias", title: saved.title, artist: saved.artist }] })
  });
  assert.deepEqual(result.recommendations.map((item) => item.slug), ["match"]);
});

test("every bookmark is researched, including beyond the former four-seed cap", async () => {
  const seeds = Array.from({ length: 8 }, (_, index) => bookmark("rock", index));
  seeds[1].artist = seeds[0].artist;
  const calls = [];
  const result = await bookmarkDiscovery({ bookmarks: seeds }, { discover: async ({ seedSlug }) => { calls.push(seedSlug); return { items: [], providerStatus: "ok" }; } });
  assert.deepEqual(calls, ["seed-0", "seed-2", "seed-3", "seed-4", "seed-5", "seed-6", "seed-7", "seed-1"]);
  assert.equal(result.seedsChecked, 8);
  assert.equal(result.totalSeeds, 8);
  assert.equal(result.status, "empty");
});

test("malformed bookmarks are rejected before provider work", async () => {
  await assert.rejects(bookmarkDiscovery({ bookmarks: [null] }), { name: "ZodError" });
});

const qualified = (slug, genre) => ({ ...candidate(slug, genre), evidence: { genres: [genre] }, components: { genre: 1 }, score: 1, reasons: [`Shares ${genre}.`] });

test("shared recommendations retain evidence from all supporting bookmarks regardless of order", async () => {
  const bookmarks = [bookmark("rage"), bookmark("cloud rap", 1)];
  const dependencies = { discover: async ({ seedSlug }) => ({ providerStatus: "ok", items: [qualified("shared", seedSlug === "seed-0" ? "rage" : "cloud rap")] }) };
  const result = await bookmarkDiscovery({ bookmarks }, dependencies);
  const reversed = await bookmarkDiscovery({ bookmarks: [...bookmarks].reverse() }, dependencies);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].matchedBookmarks.length, 2);
  assert.match(result.recommendations[0].reason, /Seed 0 by Artist 0/);
  assert.match(result.recommendations[0].reason, /Seed 1 by Artist 1/);
  assert.equal(result.recommendations[0].reason, reversed.recommendations[0].reason);
});

test("a distinct style beyond the fourth bookmark gets represented in a short list", async () => {
  const bookmarks = Array.from({ length: 6 }, (_, index) => bookmark(index === 5 ? "jazz" : "rage", index));
  const result = await bookmarkDiscovery({ bookmarks, limit: 3 }, {
    discover: async ({ seedSlug }) => ({ providerStatus: "ok", items: seedSlug === "seed-5" ? [qualified("jazz-match", "jazz")] : [qualified("rap-one", "rage"), qualified("rap-two", "rage"), qualified("rap-three", "rage")] })
  });
  assert.equal(result.seedsChecked, 6);
  assert.ok(result.recommendations.some((item) => item.slug === "jazz-match"));
});
