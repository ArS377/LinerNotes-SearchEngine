import test from "node:test";
import assert from "node:assert/strict";
import { federatedSearch } from "../src/federated-search.js";

test("merges local and global results", async () => {
  const result = await federatedSearch("Love Story", {
    musicBrainzSearch: async () => [
      {
        slug: "mbid-new",
        title: "Love Story",
        artist: "A Different Artist",
        external: true
      }
    ],
    appleSearch: async () => []
  });

  assert.equal(result.results[0].source, "Liner Notes");
  assert.ok(result.results.some((recording) => recording.slug === "mbid-new"));
  assert.equal(result.remoteStatus, "ok");
});

test("deduplicates equivalent local and global recordings", async () => {
  const result = await federatedSearch("Jolene", {
    musicBrainzSearch: async () => [
      {
        slug: "mbid-jolene",
        title: "Jolene",
        artist: "Dolly Parton",
        external: true
      }
    ],
    appleSearch: async () => []
  });

  assert.equal(
    result.results.filter(
      (recording) =>
        recording.title === "Jolene" && recording.artist === "Dolly Parton"
    ).length,
    1
  );
});

test("keeps local search working during provider outages", async () => {
  const result = await federatedSearch("Daft Punk", {
    musicBrainzSearch: async () => {
      throw new Error("offline");
    },
    appleSearch: async () => {
      throw new Error("offline");
    }
  });

  assert.equal(result.results[0].slug, "get-lucky-daft-punk");
  assert.equal(result.remoteStatus, "unavailable");
});

test("reranks an exact title and artist above a high-scoring cover", async () => {
  const result = await federatedSearch("Once in a Lifetime Talking Heads", {
    musicBrainzSearch: async () => [
      {
        slug: "mbid-cover",
        title: "Once in a Lifetime [Talking Heads]",
        artist: "The Smashing Pumpkins",
        score: 100,
        external: true
      },
      {
        slug: "mbid-original",
        title: "Once in a Lifetime",
        artist: "Talking Heads",
        score: 33,
        external: true
      }
    ],
    appleSearch: async () => []
  });

  assert.equal(result.results[0].slug, "mbid-original");
});

test("uses commercial catalog rank to break ambiguous title collisions", async () => {
  const result = await federatedSearch("one dance", {
    musicBrainzSearch: async () => [
      {
        slug: "mbid-obscure",
        title: "One Dance",
        artist: "Obscure Artist",
        source: "MusicBrainz",
        score: 100,
        external: true
      }
    ],
    appleSearch: async () => [
      {
        slug: "apple-drake",
        title: "One Dance (feat. Wizkid & Kyla)",
        artist: "Drake",
        source: "Apple Music",
        external: true
      },
      {
        slug: "apple-cover",
        title: "One Dance",
        artist: "Cover Artist",
        source: "Apple Music",
        external: true
      }
    ]
  });

  assert.equal(result.results[0].slug, "apple-drake");
});

test("an artist-specific match outranks a more prominent title-only match", async () => {
  const result = await federatedSearch("one dance little big town", {
    musicBrainzSearch: async () => [],
    appleSearch: async () => [
      {
        slug: "apple-drake",
        title: "One Dance (feat. Wizkid & Kyla)",
        artist: "Drake",
        source: "Apple Music",
        external: true
      },
      {
        slug: "apple-little-big-town",
        title: "One Dance",
        artist: "Little Big Town",
        source: "Apple Music",
        external: true
      }
    ]
  });

  assert.equal(result.results[0].slug, "apple-little-big-town");
});

test("treats an exact artist query as an artist intent, not a song title", async () => {
  const result = await federatedSearch("Taylor Swift", {
    musicBrainzSearch: async () => [
      {
        slug: "mbid-title-only",
        title: "Taylor Swift",
        artist: "Moon Moon Moon",
        source: "MusicBrainz",
        external: true,
        score: 100
      }
    ],
    appleSearch: async () => []
  });

  assert.ok(result.results.length > 0);
  assert.ok(result.results.every((recording) => recording.artist === "Taylor Swift"));
  assert.ok(result.results.some((recording) => recording.slug === "love-story-taylor-swift"));
});

test("prefers ranked commercial recordings when exact artist names collide", async () => {
  const result = await federatedSearch("Ken Carson", {
    musicBrainzSearch: async () => ({ results: [{
      slug: "mbid-country",
      title: "Foggy, Foggy Dew",
      artist: "Ken Carson",
      source: "MusicBrainz",
      external: true,
      score: 48
    }], total: 1 }),
    appleSearch: async () => ({ results: [{
      slug: "apple-rap",
      title: "Get Rich Or Die",
      artist: "Ken Carson",
      source: "Apple Music",
      external: true,
      score: 0
    }], total: 1 }),
    spotifySearch: async () => ({ results: [], configured: false })
  });
  assert.equal(result.results[0].slug, "apple-rap");
});

test("merges Apple playback data into an equivalent MusicBrainz result", async () => {
  const result = await federatedSearch("Dreams Fleetwood Mac", {
    musicBrainzSearch: async () => [
      {
        slug: "mbid-dreams",
        title: "Dreams",
        artist: "Fleetwood Mac",
        source: "MusicBrainz",
        external: true,
        score: 100
      }
    ],
    appleSearch: async () => [
      {
        slug: "apple-dreams",
        title: "Dreams",
        artist: "Fleetwood Mac",
        source: "Apple Music",
        providers: ["Apple Music"],
        external: true,
        appleMusicUrl: "https://music.apple.com/track",
        previewUrl: "https://example.com/preview.m4a"
      }
    ]
  });

  assert.equal(result.results[0].slug, "mbid-dreams");
  assert.equal(result.results[0].appleMusicUrl, "https://music.apple.com/track");
  assert.deepEqual(result.results[0].providers, ["MusicBrainz", "Apple Music"]);
});

test("uses Spotify popularity to order similarly relevant results", async () => {
  const result = await federatedSearch("Orbit", {
    musicBrainzSearch: async () => [
      {
        slug: "mbid-orbit-one",
        title: "Orbit One",
        artist: "First Artist",
        source: "MusicBrainz",
        external: true
      },
      {
        slug: "mbid-orbit-two",
        title: "Orbit Two",
        artist: "Second Artist",
        source: "MusicBrainz",
        external: true
      }
    ],
    appleSearch: async () => [],
    spotifySearch: async () => ({
      configured: true,
      results: [
        {
          title: "Orbit One",
          artist: "First Artist",
          spotifyPopularity: 35,
          spotifyUrl: "https://open.spotify.com/track/one"
        },
        {
          title: "Orbit Two",
          artist: "Second Artist",
          spotifyPopularity: 88,
          spotifyUrl: "https://open.spotify.com/track/two"
        }
      ]
    })
  });

  assert.equal(result.results[0].slug, "mbid-orbit-two");
  assert.equal(result.results[0].spotifyPopularity, 88);
  assert.equal(result.providerStatus.spotify, "ok");
});

test("a strong global title match outranks a weak local artist match", async () => {
  const result = await federatedSearch("Not Like Us Kendrick Lamar", {
    musicBrainzSearch: async () => [
      {
        slug: "mbid-not-like-us",
        title: "Not Like Us",
        artist: "Kendrick Lamar",
        source: "MusicBrainz",
        external: true,
        score: 95
      }
    ],
    appleSearch: async () => []
  });

  assert.equal(result.results[0].slug, "mbid-not-like-us");
  assert.equal(result.results[1].slug, "alright-kendrick-lamar");
});

test("a local lyric match retains enough weight to beat unrelated global text", async () => {
  const result = await federatedSearch("we gon be alright", {
    musicBrainzSearch: async () => [
      {
        slug: "mbid-unrelated",
        title: "We",
        artist: "Gon Be",
        source: "MusicBrainz",
        external: true,
        score: 100
      }
    ],
    appleSearch: async () => []
  });

  assert.equal(result.results[0].slug, "alright-kendrick-lamar");
});

test("passes offsets to providers and reports another page", async () => {
  const calls = [];
  const result = await federatedSearch("ambient", {
    offset: 20,
    limit: 20,
    musicBrainzSearch: async (_query, limit, offset) => {
      calls.push(["musicbrainz", limit, offset]);
      return {
        results: [
          {
            slug: "mbid-page-two",
            title: "Ambient Piece",
            artist: "Example Artist",
            source: "MusicBrainz",
            external: true
          }
        ],
        total: 61
      };
    },
    appleSearch: async (_query, limit, offset) => {
      calls.push(["apple", limit, offset]);
      return { results: [], total: 25 };
    }
  });

  assert.deepEqual(calls, [
    ["musicbrainz", 20, 20],
    ["apple", 20, 20]
  ]);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextOffset, 40);
  assert.equal(result.localCount, 0);
});
