// Regression: ISSUE-001, Chrome QA 2026-09-16. See outputs/qa-report-2026-09-16.md.
import test from "node:test";
import assert from "node:assert/strict";
import { rankCandidates } from "../src/discovery.js";

const seed = { slug: "seed", title: "Seed", artist: "Seed artist", genres: ["example style"], releaseDate: "2023", genreResearch: { selected: ["example style"], entries: [] } };
const track = (slug, artist, album, genres = seed.genres) => ({ slug, title: slug, artist, album, genres, releaseDate: "2023" });
const options = { focus: "balanced", differentArtists: true, limit: 5 };

test("one album cannot occupy four positions in a discovery list", () => {
  const candidates = [0, 1, 2, 3].map((n) => track(`repeat-${n}`, "Artist A", "One album"));
  candidates.push(track("b", "Artist B", "Other album"), track("c", "Artist C", "Third album"));
  const result = rankCandidates(seed, candidates, options);
  assert.equal(result.filter((item) => item.album === "One album").length, 1);
  assert.equal(result.length, 3);
});

test("artist caps apply across albums without treating unknown albums as identical", () => {
  const candidates = [track("a", "Artist A", ""), track("b", "Artist A", "Release unknown"), track("c", "Artist A", "Third")];
  const result = rankCandidates(seed, candidates, options);
  assert.equal(result.length, 2);
});

test("diversity does not introduce unrelated music or merge same-named albums by different artists", () => {
  const candidates = [track("a", "Artist A", "Greatest Hits"), track("b", "Artist B", "Greatest Hits"), track("c", "Artist C", "Other", ["unrelated style"])];
  assert.deepEqual(rankCandidates(seed, candidates, options).map((item) => item.slug), ["a", "b"]);
});
