import test from "node:test";
import assert from "node:assert/strict";
import { researchGenres, normalizeGenre } from "../src/genre-research.js";

const research = (recording, artist, counts) => researchGenres(recording, artist, { catalog: async () => Object.keys(counts), count: async (name) => counts[name] });

for (const [broad, narrow] of [["hip hop", "rage"], ["rock", "shoegaze"], ["electronic", "dub techno"], ["jazz", "bebop"], ["country", "bluegrass"], ["metal", "atmospheric black metal"], ["pop", "city pop"], ["folk", "contemporary folk"], ["classical", "baroque"], ["reggae", "roots reggae"], ["soul", "neo soul"], ["new provider genre", "new provider microgenre"]]) {
  test(`provider-derived specificity: ${broad} → ${narrow}`, async () => {
    const result = await research({ genres: [broad] }, { genres: [broad, narrow] }, { [broad]: 10000, [narrow]: 100 });
    assert.deepEqual(result.selected, [narrow]);
    assert.equal(result.entries.find((entry) => entry.name === narrow).level, "artist");
  });
}

test("recording-specific evidence wins over an artist's unrelated styles", async () => {
  const result = await research({ genres: ["folk", "acoustic folk"] }, { genres: ["pop", "synth pop"] }, { folk: 9000, "acoustic folk": 100, pop: 100000, "synth pop": 50 });
  assert.deepEqual(result.selected, ["acoustic folk"]);
});
test("official catalog rejects moods, decades and biographical tags", async () => {
  const result = await research({ genres: ["jazz", "pescetarian", "2020s", "sad"] }, null, { jazz: 100 });
  assert.deepEqual(result.entries.map((entry) => entry.name), ["jazz"]);
});
test("unavailable counts are unknown rather than zero rarity", async () => {
  const result = await researchGenres({ genres: ["rock", "shoegaze"] }, null, { catalog: async () => ["rock", "shoegaze"], count: async (name) => { if (name === "shoegaze") throw new Error("offline"); return 1000; } });
  assert.equal(result.status, "partial");
  assert.equal(result.entries.length, 1);
});
test("catalog outage does not invent a taxonomy", async () => {
  const result = await researchGenres({ genres: ["anything"] }, null, { catalog: async () => { throw new Error("offline"); } });
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.selected, []);
});
test("zero-support tags cannot win by rarity", async () => {
  const result = await research({ genres: ["jazz", "new style"] }, null, { jazz: 1000, "new style": 0 });
  assert.deepEqual(result.selected, ["jazz"]);
});
test("genre normalization preserves non-Latin names", () => {
  assert.equal(normalizeGenre("日本 民謡"), "日本 民謡");
  assert.equal(normalizeGenre("Électro-Pop"), "électro pop");
});

test("a rare weakly supported artist tag cannot override the principal style", async () => {
  const result = await research({ genres: [] }, { genres: ["shoegaze", "c86"], genreVotes: { shoegaze: 30, c86: 1 } }, { shoegaze: 8000, c86: 38 });
  assert.deepEqual(result.selected, ["shoegaze"]);
});
