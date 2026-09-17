import test from "node:test";
import assert from "node:assert/strict";
import {
  lookupMusicBrainzArtist,
  lookupMusicBrainzArtistMetadata,
  lookupMusicBrainzRecording,
  searchMusicBrainzArtists,
  searchMusicBrainz,
  listMusicBrainzGenres,
  searchMusicBrainzAlbums,
  lookupMusicBrainzAlbumGenres,
  setMusicBrainzFetchForTests
} from "../src/providers/musicbrainz.js";

test("normalizes MusicBrainz search results", async () => {
  setMusicBrainzFetchForTests(async () => ({
    ok: true,
    json: async () => ({
      recordings: [
        {
          id: "1234",
          title: "Dreams",
          score: 99,
          length: 257000,
          "artist-credit": [
            { name: "Fleetwood Mac", artist: { id: "artist-1", name: "Fleetwood Mac" } }
          ],
          releases: [{ title: "Rumours", status: "Official", date: "1977-02-04" }],
          genres: [{ name: "rock", count: 4 }]
        }
      ]
    })
  }));

  const results = await searchMusicBrainz("Dreams");
  assert.equal(results.results[0].slug, "mbid-1234");
  assert.equal(results.results[0].artist, "Fleetwood Mac");
  assert.equal(results.results[0].duration, "4:17");
});

test("searches MusicBrainz artists for cross-provider enrichment", async () => {
  setMusicBrainzFetchForTests(async () => ({
    ok: true,
    json: async () => ({
      artists: [
        {
          id: "artist-ken",
          name: "Ken Carson",
          "sort-name": "Carson, Ken",
          country: "US",
          disambiguation: "US rapper",
          score: 100
        }
      ]
    })
  }));

  const artists = await searchMusicBrainzArtists('artist:"Ken Carson"');
  assert.equal(artists[0].id, "artist-ken");
  assert.equal(artists[0].name, "Ken Carson");
});

test("builds an on-demand song page from a MusicBrainz lookup", async () => {
  setMusicBrainzFetchForTests(async () => ({
    ok: true,
    json: async () => ({
      id: "5678",
      title: "Once in a Lifetime",
      length: 251000,
      "first-release-date": "1980-10-08",
      "artist-credit": [
        {
          name: "Talking Heads",
          artist: { id: "artist-2", name: "Talking Heads", country: "US" }
        }
      ],
      releases: [{ title: "Remain in Light", status: "Official", date: "1980-10-08" }],
      genres: [{ name: "new wave", count: 5 }]
    })
  }));

  const recording = await lookupMusicBrainzRecording("5678");
  assert.equal(recording.title, "Once in a Lifetime");
  assert.equal(recording.artist.name, "Talking Heads");
  assert.equal(recording.external, true);
  assert.match(recording.musicBrainzUrl, /5678/);
});

test("builds a global artist profile with recordings", async () => {
  setMusicBrainzFetchForTests(async (url) => {
    if (String(url).includes("/artist/")) {
      return {
        ok: true,
        json: async () => ({
          id: "artist-2",
          name: "Talking Heads",
          type: "Group",
          country: "US",
          genres: [{ name: "new wave", count: 10 }],
          relations: []
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        recordings: [
          {
            id: "recording-1",
            title: "Once in a Lifetime",
            score: 100,
            "artist-credit": [
              { name: "Talking Heads", artist: { id: "artist-2", name: "Talking Heads" } }
            ],
            releases: [{ title: "Remain in Light", status: "Official", date: "1980" }]
          }
        ]
      })
    };
  });

  const artist = await lookupMusicBrainzArtist("artist-2");
  assert.equal(artist.name, "Talking Heads");
  assert.equal(artist.recordings[0].title, "Once in a Lifetime");
});

test("returns artist relationships for page enrichment", async () => {
  setMusicBrainzFetchForTests(async () => ({
    ok: true,
    json: async () => ({
      id: "artist-3",
      name: "Example Artist",
      type: "Person",
      country: "US",
      genres: [{ name: "hip hop", count: 4 }],
      relations: [
        {
          type: "wikidata",
          url: { resource: "https://www.wikidata.org/wiki/Q1" }
        },
        {
          type: "lyrics",
          url: { resource: "https://genius.com/artists/Example-artist" }
        }
      ]
    })
  }));

  const artist = await lookupMusicBrainzArtistMetadata("artist-3");
  assert.equal(artist.genres[0], "hip hop");
  assert.equal(artist.urls[0].type, "wikidata");
  assert.equal(artist.urls[1].type, "lyrics");
});

test("serializes concurrent uncached MusicBrainz requests", async () => {
  const startedAt = [];
  setMusicBrainzFetchForTests(async () => {
    startedAt.push(Date.now());
    return {
      ok: true,
      json: async () => ({ recordings: [], count: 0, offset: 0 })
    };
  });

  await Promise.all([
    searchMusicBrainz("first query"),
    searchMusicBrainz("second query")
  ]);

  assert.ok(
    startedAt[1] - startedAt[0] >= 1000,
    `Expected serialized requests, received ${startedAt[1] - startedAt[0]}ms`
  );
});

test("coalesces identical concurrent MusicBrainz requests", async () => {
  let requestCount = 0;
  setMusicBrainzFetchForTests(async () => {
    requestCount += 1;
    return {
      ok: true,
      json: async () => ({ recordings: [], count: 0, offset: 0 })
    };
  });

  await Promise.all([
    searchMusicBrainz("same query"),
    searchMusicBrainz("same query")
  ]);
  assert.equal(requestCount, 1);
});

test("transient overload is retried once through the rate limiter", async () => {
  let requests = 0;
  setMusicBrainzFetchForTests(async () => ++requests === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ recordings: [] }) });
  await searchMusicBrainz("retry overload");
  assert.equal(requests, 2);
});

test("persistent overload stops after bounded recovery attempts", async () => {
  let requests = 0;
  setMusicBrainzFetchForTests(async () => { requests++; return { ok: false, status: 503 }; });
  await assert.rejects(searchMusicBrainz("still overloaded"), /503/);
  assert.equal(requests, 3);
});

test("loads the complete provider genre list using the unpaginated text endpoint", async () => {
  setMusicBrainzFetchForTests(async (url) => {
    assert.equal(url.pathname, "/ws/2/genre/all");
    assert.equal(url.searchParams.get("fmt"), "txt");
    return { ok: true, text: async () => "bebop\nnew genre\n日本民謡\nbebop\n" };
  });
  assert.deepEqual(await listMusicBrainzGenres(), ["bebop", "new genre", "日本民謡"]);
});

test("album search retains the identity needed for an exact match", async () => {
  setMusicBrainzFetchForTests(async () => ({ ok: true, json: async () => ({ "release-groups": [{ id: "album-1", title: "New Direction", "artist-credit": [{ name: "Example Artist" }] }] }) }));
  assert.deepEqual(await searchMusicBrainzAlbums('releasegroup:"New Direction"'), [{ id: "album-1", title: "New Direction", artist: "Example Artist" }]);
});

test("album genre lookup preserves provider vote counts", async () => {
  setMusicBrainzFetchForTests(async () => ({ ok: true, json: async () => ({ id: "album-1", title: "New Direction", "artist-credit": [{ name: "Example Artist" }], genres: [{ name: "indie folk", count: 7 }] }) }));
  const album = await lookupMusicBrainzAlbumGenres("album-1");
  assert.equal(album.genreVotes["indie folk"], 7);
  assert.deepEqual(album.genres, ["indie folk"]);
});
