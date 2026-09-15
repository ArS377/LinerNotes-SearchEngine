import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { server } from "../src/server.js";
import { setMusicBrainzFetchForTests } from "../src/providers/musicbrainz.js";
import { setAppleFetchForTests } from "../src/providers/apple.js";
import { setCoverArtFetchForTests } from "../src/providers/cover-art.js";
import { setWikimediaFetchForTests } from "../src/providers/wikimedia.js";
import {
  setOpenClawExecFileForTests,
  setOpenClawFetchForTests
} from "../src/providers/openclaw.js";

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
  assert.equal(result.method, "subgenre-mmr-v2");
  assert.ok(result.items.every((item) => item.slug !== result.seed.slug && item.reasons.length));
});

before(async () => {
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
  assert.match(body.providers.openClaw, /configured|not-configured/);
  assert.equal(typeof body.uptimeSeconds, "number");
});

test("capabilities endpoint reports configured product features", async () => {
  const response = await fetch(`${baseUrl}/api/capabilities`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.globalSearch, true);
  assert.equal(body.applePlayback, true);
  assert.equal(typeof body.audioIdentification, "boolean");
  assert.equal(typeof body.openClawAssistant, "boolean");
});

test("assistant endpoint reports missing OpenClaw configuration", async () => {
  const previousBaseUrl = process.env.OPENCLAW_BASE_URL;
  const previousApiKey = process.env.OPENCLAW_API_KEY;
  delete process.env.OPENCLAW_BASE_URL;
  delete process.env.OPENCLAW_API_KEY;
  try {
    const response = await fetch(`${baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "What should I listen to next?" })
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.ok(body.required.includes("OPENCLAW_BASE_URL"));
  } finally {
    if (previousBaseUrl === undefined) delete process.env.OPENCLAW_BASE_URL;
    else process.env.OPENCLAW_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.OPENCLAW_API_KEY;
    else process.env.OPENCLAW_API_KEY = previousApiKey;
  }
});

test("assistant endpoint proxies read-only music context to OpenClaw", async () => {
  const previousBaseUrl = process.env.OPENCLAW_BASE_URL;
  const previousApiKey = process.env.OPENCLAW_API_KEY;
  process.env.OPENCLAW_BASE_URL = "https://openclaw.example.test/";
  process.env.OPENCLAW_API_KEY = "test-key";

  try {
    setOpenClawFetchForTests(async (url, options) => {
      assert.equal(String(url), "https://openclaw.example.test/api/ask");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.authorization, "Bearer test-key");
      const body = JSON.parse(options.body);
      assert.equal(body.prompt, "Explain this song");
      assert.equal(body.context.application, "Liner Notes");
      assert.equal(body.context.mode, "read-only music research assistant");
      assert.equal(body.context.song.title, "Alright");
      return {
        ok: true,
        json: async () => ({
          answer: "Start with the album context and compare live versions.",
          citations: [{ title: "MusicBrainz" }],
          model: "openclaw-test"
        })
      };
    });

    const response = await fetch(`${baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "Explain this song",
        context: { type: "song", song: { title: "Alright" } }
      })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.match(body.answer, /album context/);
    assert.equal(body.model, "openclaw-test");
  } finally {
    if (previousBaseUrl === undefined) delete process.env.OPENCLAW_BASE_URL;
    else process.env.OPENCLAW_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.OPENCLAW_API_KEY;
    else process.env.OPENCLAW_API_KEY = previousApiKey;
    setOpenClawFetchForTests(globalThis.fetch);
  }
});

test("assistant endpoint can call a local OpenClaw CLI transport", async () => {
  const previousTransport = process.env.OPENCLAW_TRANSPORT;
  const previousCliPath = process.env.OPENCLAW_CLI_PATH;
  const previousSessionKey = process.env.OPENCLAW_SESSION_KEY;
  process.env.OPENCLAW_TRANSPORT = "cli";
  process.env.OPENCLAW_CLI_PATH = "openclaw-test";
  process.env.OPENCLAW_SESSION_KEY = "agent:main:test-session";

  try {
    setOpenClawExecFileForTests(async (file, args) => {
      assert.equal(file, "openclaw-test");
      assert.deepEqual(args.slice(0, 3), ["agent", "--session-key", "agent:main:test-session"]);
      assert.ok(args.includes("--json"));
      const message = args[args.indexOf("--message") + 1];
      assert.match(message, /Explain this result/);
      assert.match(message, /read-only music research assistant/);
      assert.match(message, /Visible Song/);
      return {
        stdout: JSON.stringify({
          reply: "Visible Song is the strongest match.",
          modelId: "claude-cli-test"
        })
      };
    });

    const response = await fetch(`${baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "Explain this result",
        context: { type: "search", visibleResults: [{ title: "Visible Song" }] }
      })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.answer, "Visible Song is the strongest match.");
    assert.equal(body.model, "claude-cli-test");
  } finally {
    if (previousTransport === undefined) delete process.env.OPENCLAW_TRANSPORT;
    else process.env.OPENCLAW_TRANSPORT = previousTransport;
    if (previousCliPath === undefined) delete process.env.OPENCLAW_CLI_PATH;
    else process.env.OPENCLAW_CLI_PATH = previousCliPath;
    if (previousSessionKey === undefined) delete process.env.OPENCLAW_SESSION_KEY;
    else process.env.OPENCLAW_SESSION_KEY = previousSessionKey;
    setOpenClawExecFileForTests(null);
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
  assert.equal(body.recommendations[0].slug, "love-story-taylor-swift");
  assert.match(body.recommendations[0].reason, /country/i);
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
