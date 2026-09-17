import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { server } from "../src/server.js";
import { setMusicBrainzFetchForTests } from "../src/providers/musicbrainz.js";
import { setAppleFetchForTests } from "../src/providers/apple.js";
import { setCoverArtFetchForTests } from "../src/providers/cover-art.js";
import { setWikimediaFetchForTests } from "../src/providers/wikimedia.js";
import { setDeepInfraFetchForTests } from "../src/providers/deepinfra.js";
import { setTavilyFetchForTests } from "../src/providers/tavily.js";
const previousTavilyKey = process.env.TAVILY_API_KEY;

let baseUrl;

test("track discovery validates input and resolves canonical songs", async () => {
  const invalid = await fetch(`${baseUrl}/api/v1/discover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seedSlug: "https://example.com" }) });
  assert.equal(invalid.status, 400);
  const missing = await fetch(`${baseUrl}/api/v1/discover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seedSlug: "does-not-exist" }) });
  assert.equal(missing.status, 404);
  const response = await fetch(`${baseUrl}/api/v1/discover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seedSlug: "love-story-taylor-swift", differentArtists: false, focus: "genre" }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.seed.title, "Love Story");
  assert.equal(result.method, "catalog-research-mmr-v3");
  assert.ok(result.items.every((item) => item.slug !== result.seed.slug && item.reasons.length));
});

before(async () => {
  process.env.TAVILY_API_KEY = "test-tavily";
  setTavilyFetchForTests(async () => ({ ok: true, json: async () => ({ results: [{ title: "Music source", url: "https://example.com/music", content: "Music context" }] }) }));
  setWikimediaFetchForTests(async (url) => {
    if (String(url).includes("Special:EntityData")) {
      return {
        ok: true,
        json: async () => ({
          entities: {
            Q1: {
              descriptions: { en: { value: "Remote artist" } },
              sitelinks: { enwiki: { title: "Remote Artist" } }
            }
          }
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        query: {
          pages: [{
            title: "Remote Artist",
            extract: "Remote Artist is an American recording artist.",
            thumbnail: { source: "https://example.com/artist.jpg" }
          }]
        }
      })
    };
  });
  setCoverArtFetchForTests(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      images: [
        {
          front: true,
          image: "https://example.com/cover.jpg",
          thumbnails: { "500": "https://example.com/cover-500.jpg" }
        }
      ]
    })
  }));
  setAppleFetchForTests(async (url) => {
    const isLookup = String(url).includes("/lookup");
    return {
      ok: true,
      json: async () => ({
        resultCount: 1,
        results: [
          {
            wrapperType: "track",
            kind: "song",
            trackId: isLookup ? 99 : 1,
            artistId: 2,
            artistName: isLookup ? "Apple Artist" : "Kendrick Lamar",
            collectionName: isLookup ? "Apple Album" : "To Pimp a Butterfly",
            trackName: isLookup ? "Apple Song" : "Alright",
            trackCensoredName: isLookup ? "Apple Song" : "Alright",
            trackViewUrl: "https://music.apple.com/track",
            previewUrl: "https://example.com/preview.m4a",
            artworkUrl100: "https://example.com/100x100bb.jpg",
            releaseDate: "2024-01-01T00:00:00Z",
            trackTimeMillis: 180000,
            primaryGenreName: "Pop",
            isStreamable: true
          }
        ]
      })
    };
  });
  setMusicBrainzFetchForTests(async (url) => {
    if (String(url).includes("/artist/remote-artist")) {
      return {
        ok: true,
        json: async () => ({
          id: "remote-artist",
          name: "Remote Artist",
          type: "Person",
          country: "US",
          genres: [{ name: "hip hop", count: 3 }],
          relations: [
            {
              type: "wikidata",
              url: { resource: "https://www.wikidata.org/wiki/Q1" }
            },
            {
              type: "lyrics",
              url: { resource: "https://genius.com/artists/Remote-artist" }
            }
          ]
        })
      };
    }
    if (String(url).includes("/recording/remote-id")) {
      return {
        ok: true,
        json: async () => ({
          id: "remote-id",
          title: "Remote Song",
          "artist-credit": [
            { name: "Remote Artist", artist: { id: "remote-artist", name: "Remote Artist" } }
          ],
          releases: [{
            id: "remote-release",
            title: "Remote Album",
            status: "Official",
            date: "2024"
          }]
        })
      };
    }
    return { ok: true, json: async () => ({ recordings: [] }) };
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  setTavilyFetchForTests(globalThis.fetch);
  if (previousTavilyKey === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = previousTavilyKey;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

test("health endpoint reports readiness", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("status endpoint reports runtime and provider modes", async () => {
  const response = await fetch(`${baseUrl}/api/status`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.providers.musicBrainz, "enabled");
  assert.equal(body.providers.appleMusic, "enabled");
  assert.match(body.providers.deepInfra, /configured|not-configured/);
  assert.equal(typeof body.uptimeSeconds, "number");
});

test("capabilities endpoint reports configured product features", async () => {
  const response = await fetch(`${baseUrl}/api/capabilities`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.globalSearch, true);
  assert.equal(body.applePlayback, true);
  assert.equal(typeof body.audioIdentification, "boolean");
  assert.equal(typeof body.musicAssistant, "boolean");
});

test("assistant endpoint reports missing DeepInfra configuration", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  delete process.env.DEEPINFRA_API_KEY;
  try {
    const response = await fetch(`${baseUrl}/api/assistant`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "What album is this from?" })
    });
    assert.equal(response.status, 503);
    assert.deepEqual((await response.json()).required, ["DEEPINFRA_API_KEY"]);
  } finally {
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});

test("assistant endpoint sends catalog context to DeepInfra", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  process.env.DEEPINFRA_API_KEY = "test-key";
  try {
    setDeepInfraFetchForTests(async (url, options) => {
      assert.equal(url, "https://api.deepinfra.com/v1/openai/chat/completions");
      assert.equal(options.headers.authorization, "Bearer test-key");
      const body = JSON.parse(options.body);
      assert.equal(body.max_tokens, 512);
      assert.equal(body.messages[0].role, "system");
      const supplied = JSON.parse(body.messages[1].content);
      assert.equal(supplied.question, "Explain this song");
      assert.equal(supplied.catalogContext.song.title, "Alright");
      return { ok: true, json: async () => ({ choices: [{ message: { content: "It is from To Pimp a Butterfly." } }] }) };
    });
    const response = await fetch(`${baseUrl}/api/assistant`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Explain this song", context: { song: { title: "Alright", album: "To Pimp a Butterfly" } } })
    });
    assert.equal(response.status, 200);
    assert.match((await response.json()).answer, /To Pimp a Butterfly/);
  } finally {
    setDeepInfraFetchForTests(globalThis.fetch);
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});

test("assistant explains provider overload without exposing upstream details", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  process.env.DEEPINFRA_API_KEY = "test-key";
  try {
    setDeepInfraFetchForTests(async () => ({ ok: false, status: 429 }));
    const response = await fetch(`${baseUrl}/api/assistant`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Compare these recordings" })
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /busy or rate-limited/);
  } finally {
    setDeepInfraFetchForTests(globalThis.fetch);
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});

test("audio identification reports missing provider configuration", async () => {
  const response = await fetch(`${baseUrl}/api/identify`, {
    method: "POST",
    headers: { "content-type": "audio/mpeg" },
    body: Buffer.from("sample")
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.ok(body.required.includes("ACRCLOUD_HOST"));
});

test("search endpoint returns explained matches", async () => {
  const response = await fetch(`${baseUrl}/api/search?q=with%20the%20lights%20out`);
  const body = await response.json();
  assert.equal(body.results[0].slug, "smells-like-teen-spirit-nirvana");
  assert.equal(body.results[0].matchReason, "lyric match");
  assert.equal(body.remoteStatus, "ok");
  assert.equal(body.offset, 0);
  assert.equal(typeof body.hasMore, "boolean");
  assert.equal(body.intent.type, "lyrics");
  assert.equal(typeof body.timings.totalMs, "number");
});

test("local search corrects a misspelled artist intent before retrieval", async () => {
  const response = await fetch(`${baseUrl}/api/search?q=kendrick%20llamar&mode=local`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, "local");
  assert.equal(body.intent.type, "artist");
  assert.equal(body.intent.entities.artist, "Kendrick Lamar");
  assert.equal(body.providerStatus.musicBrainz, "skipped");
  assert.equal(body.providerStatus.apple, "skipped");
  assert.equal(body.results[0].artist, "Kendrick Lamar");
});

test("recommendations return private metrics and explainable ranking", async () => {
  const response = await fetch(`${baseUrl}/api/v1/recommendations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bookmarks: [{
        slug: "jolene-dolly-parton",
        title: "Jolene",
        artist: "Dolly Parton",
        genres: ["Country"],
        releaseDate: "1973-10-15"
      }],
      recentQueries: ["Dolly Parton"]
    })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.profile.bookmarkCount, 1);
  assert.equal(body.profile.topArtists[0].name, "Dolly Parton");
  assert.equal(body.method, "bookmark-discovery-v2");
  assert.ok(body.recommendations.every((item) => item.evidence.genres.length > 0 && item.components.genre > 0));
});

test("suggest endpoint returns local and commercial candidates", async () => {
  const response = await fetch(`${baseUrl}/api/suggest?q=alright`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.suggestions.length > 0);
  assert.equal(body.suggestions[0].title, "Alright");
});

test("external song endpoint builds a global catalog page", async () => {
  const response = await fetch(`${baseUrl}/api/external-songs/remote-id`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.title, "Remote Song");
  assert.equal(body.external, true);
  assert.equal(body.appleMusicUrl, "https://music.apple.com/track");
  assert.equal(body.previewUrl, "/api/apple-previews/1");
  assert.equal(body.artworkUrl, "https://example.com/cover.jpg");
  assert.ok(body.sources.includes("Cover Art Archive"));
  assert.ok(body.sources.includes("Wikipedia"));
  assert.ok(body.sourceFacts.some((fact) => fact.source === "Apple Music"));
  assert.match(body.artist.summary, /American recording artist/);
  assert.equal(body.artist.imageUrl, "https://example.com/artist.jpg");
  assert.match(body.lyrics.searchUrl, /genius\.com\/search/);
});

test("Apple song endpoint builds a commercial catalog page", async () => {
  const response = await fetch(`${baseUrl}/api/apple-songs/99`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.title, "Apple Song");
  assert.equal(body.appleMusicUrl, "https://music.apple.com/track");
  assert.equal(body.previewUrl, "/api/apple-previews/99");
});

test("local playback endpoint resolves store and preview links", async () => {
  const response = await fetch(`${baseUrl}/api/playback/alright-kendrick-lamar`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.appleMusicUrl, "https://music.apple.com/track");
  assert.equal(body.previewUrl, "/api/apple-previews/1");
  assert.match(body.spotifySearchUrl, /open\.spotify\.com\/search/);
});

test("song endpoint returns canonical artist and related versions", async () => {
  const response = await fetch(`${baseUrl}/api/songs/love-story-taylor-swift`);
  const body = await response.json();
  assert.equal(body.artist.name, "Taylor Swift");
  assert.equal(body.related[0].slug, "love-story-taylors-version");
  assert.ok(body.sourceFacts.some((fact) => fact.source === "MusicBrainz"));
});

test("song endpoint returns 404 for unknown slugs", async () => {
  const response = await fetch(`${baseUrl}/api/songs/not-a-song`);
  assert.equal(response.status, 404);
});

test("discover endpoint returns featured recordings and generated genres", async () => {
  const response = await fetch(`${baseUrl}/api/discover`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.featured[0].slug, "bohemian-rhapsody-queen");
  assert.ok(body.genres.some((genre) => genre.slug === "hip-hop"));
});

test("artist endpoint returns an artist discography", async () => {
  const response = await fetch(`${baseUrl}/api/artists/taylor-swift`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.name, "Taylor Swift");
  assert.equal(body.recordings.length, 2);
});

test("global artist routes return provider profiles", async () => {
  const musicBrainz = await fetch(
    `${baseUrl}/api/external-artists/remote-artist`
  );
  const apple = await fetch(`${baseUrl}/api/apple-artists/2`);
  assert.equal(musicBrainz.status, 200);
  assert.equal(apple.status, 200);
  const musicBrainzBody = await musicBrainz.json();
  assert.match(musicBrainzBody.summary, /American recording artist/);
  assert.equal(musicBrainzBody.imageUrl, "https://example.com/artist.jpg");
});

test("genre endpoint returns matching recordings", async () => {
  const response = await fetch(`${baseUrl}/api/genres/country`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.recordings.every((recording) => recording.genres.includes("country")));
});

test("discovery endpoints return 404 for unknown entities", async () => {
  const artistResponse = await fetch(`${baseUrl}/api/artists/unknown`);
  const genreResponse = await fetch(`${baseUrl}/api/genres/unknown`);
  assert.equal(artistResponse.status, 404);
  assert.equal(genreResponse.status, 404);
});

test("serves the production application shell", async () => {
  const response = await fetch(baseUrl);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /Find the song/);
  assert.match(body, /data-search-form/);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("serves client routes through the application shell", async () => {
  const response = await fetch(`${baseUrl}/songs/jolene-dolly-parton`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /Liner Notes/);
});

test("serves global recording routes through the application shell", async () => {
  const response = await fetch(`${baseUrl}/songs/mbid-remote-id`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /Liner Notes/);
});

test("serves Apple recording routes through the application shell", async () => {
  const response = await fetch(`${baseUrl}/songs/apple-99`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /Liner Notes/);
});

test("supports deployment probes for static assets", async () => {
  const response = await fetch(`${baseUrl}/styles.css`, { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/css/);
});

test("returns 404 for missing static assets", async () => {
  const response = await fetch(`${baseUrl}/missing.css`);
  assert.equal(response.status, 404);
});
