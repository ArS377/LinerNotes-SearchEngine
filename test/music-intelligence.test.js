import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMusicInsights,
  classifySearchIntent,
  resolveSearchIntent
} from "../src/music-intelligence.js";

test("classifies exact artists, mixed searches, and lyric fragments", () => {
  assert.equal(classifySearchIntent("Taylor Swift").type, "artist");
  assert.deepEqual(classifySearchIntent("kendrick llamar"), {
    type: "artist",
    confidence: 0.9,
    entities: { artist: "Kendrick Lamar" }
  });
  assert.equal(classifySearchIntent("taylor swfit").type, "artist");
  assert.equal(classifySearchIntent("Love Story Taylor Swift").type, "mixed");
  assert.equal(classifySearchIntent("we were both young when i first saw you").type, "lyrics");
  assert.equal(classifySearchIntent("Jolene").type, "track");
});

test("resolves an external artist from repeated exact credits", () => {
  const initial = classifySearchIntent("Ken Carson");
  const results = ["Get Rich Or Die", "delusional", "Freestyle 2"].map((title) => ({
    title,
    artist: "Ken Carson",
    source: "Apple Music"
  }));
  assert.deepEqual(resolveSearchIntent(initial, "Ken Carson", results), {
    type: "artist",
    confidence: 0.94,
    entities: { artist: "Ken Carson" }
  });
  assert.equal(resolveSearchIntent(initial, "Love Story", results).type, "track");
});

test("builds private taste metrics and explainable recommendations", () => {
  const result = buildMusicInsights({
    bookmarks: [{
      slug: "jolene-dolly-parton",
      title: "Jolene",
      artist: "Dolly Parton",
      genres: ["country"],
      releaseDate: "1973-10-15"
    }],
    recentQueries: ["classic country"]
  });

  assert.equal(result.profile.bookmarkCount, 1);
  assert.equal(result.profile.topGenres[0].name, "country");
  assert.ok(result.recommendations.every((item) => item.slug !== "jolene-dolly-parton"));
  assert.ok(result.recommendations.every((item) => item.reason.length > 0));
  assert.deepEqual(result.recommendations, []);
  assert.equal(result.method, "bookmark-discovery-v2");
});
