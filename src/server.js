import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize as normalizePath } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  getArtistProfile,
  getFeaturedRecordings,
  getGenre,
  getGenres,
  getRecording
} from "./catalog.js";
import { federatedSearch } from "./federated-search.js";
import { searchRecordings } from "./search.js";
import {
  lookupMusicBrainzArtist,
  lookupMusicBrainzArtistMetadata,
  lookupMusicBrainzRecording,
  searchMusicBrainz,
  searchMusicBrainzArtists
} from "./providers/musicbrainz.js";
import {
  lookupAppleArtist,
  lookupAppleTrack,
  searchAppleMusic
} from "./providers/apple.js";
import { resolveSpotifyTrack } from "./providers/spotify.js";
import { lookupCoverArt } from "./providers/cover-art.js";
import { lookupWikimediaArtist } from "./providers/wikimedia.js";
import {
  audioIdentificationConfigured,
  identifyAudio
} from "./providers/acrcloud.js";
import {
  askOpenClaw,
  openClawConfigured
} from "./providers/openclaw.js";
import { cached, cacheStatus, rateLimit } from "./services/cache.js";
import {
  addHistory,
  authenticate,
  clearHistory,
  deleteAccount,
  exportAccount,
  libraryConfigured,
  listHistory,
  listSaved,
  removeSaved,
  saveRecording
} from "./services/library.js";

const root = fileURLToPath(new URL("../public", import.meta.url));
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function normalizedText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function enrichArtistContext(recording, artistId) {
  const artistMetadata = artistId
    ? await lookupMusicBrainzArtistMetadata(artistId).catch(() => null)
    : null;
  if (!artistMetadata) return recording;

  const wikidataUrl = artistMetadata.urls.find(
    (relation) => relation.type === "wikidata"
  )?.url;
  const wikimedia = await lookupWikimediaArtist(wikidataUrl).catch(() => null);
  const relationUrl = (type, predicate = () => true) =>
    artistMetadata.urls.find(
      (relation) => relation.type === type && predicate(relation.url)
    )?.url || null;

  recording.artist = {
    ...recording.artist,
    id: artistMetadata.id,
    slug: `mbid-${artistMetadata.id}`,
    country: artistMetadata.country,
    genres: artistMetadata.genres,
    summary:
      wikimedia?.summary
      || artistMetadata.disambiguation
      || `${artistMetadata.type} associated with ${artistMetadata.genres.join(", ")}.`,
    imageUrl: wikimedia?.imageUrl || null,
    wikipediaUrl: wikimedia?.wikipediaUrl || null,
    wikidataUrl: wikimedia?.wikidataUrl || wikidataUrl || null,
    officialUrl: relationUrl("official homepage"),
    spotifyUrl: relationUrl(
      "free streaming",
      (value) => value.startsWith("https://open.spotify.com/artist/")
    ),
    lyricsUrl: relationUrl("lyrics")
  };
  recording.genres = recording.genres.length
    ? recording.genres
    : artistMetadata.genres;
  recording.lyrics = {
    ...recording.lyrics,
    searchUrl: `https://genius.com/search?q=${encodeURIComponent(
      `${recording.title} ${recording.artist.name}`
    )}`,
    artistUrl: recording.artist.lyricsUrl
  };
  recording.sources = [
    ...new Set([
      ...recording.sources,
      "MusicBrainz",
      ...(wikimedia ? [wikimedia.source, "Wikidata"] : [])
    ])
  ];
  recording.sourceFacts.push({
    source: "MusicBrainz",
    fields: ["artist identity", "genres", "external relationships"],
    retrievedAt: new Date().toISOString(),
    confidence: "canonical artist metadata"
  });
  if (wikimedia) {
    recording.sourceFacts.push({
      source: wikimedia.source,
      fields: ["artist biography", "artist image"],
      retrievedAt: new Date().toISOString(),
      confidence: "linked from MusicBrainz via Wikidata"
    });
  }
  return recording;
}

async function findMusicBrainzMatch(title, artist) {
  const payload = await searchMusicBrainz(`${title} ${artist}`, 10).catch(
    () => ({ results: [] })
  );
  const normalizedTitle = normalizedText(title);
  const normalizedArtist = normalizedText(artist);
  return payload.results.find(
    (candidate) =>
      normalizedText(candidate.title) === normalizedTitle
      && normalizedText(candidate.artist) === normalizedArtist
  ) || payload.results.find(
    (candidate) =>
      normalizedText(candidate.title) === normalizedTitle
      && normalizedText(candidate.artist).includes(normalizedArtist)
  ) || null;
}

async function findMusicBrainzArtist(name) {
  const artists = await searchMusicBrainzArtists(`artist:"${name}"`, 10).catch(
    () => []
  );
  const normalizedName = normalizedText(name);
  return artists.find(
    (artist) => normalizedText(artist.name) === normalizedName
  ) || null;
}

function localApplePreviewUrl(trackId) {
  return trackId ? `/api/apple-previews/${encodeURIComponent(trackId)}` : null;
}

function addSpotifyPopularity(recording, spotify) {
  Object.assign(recording, spotify);
  if (!Number.isFinite(spotify.spotifyPopularity)) return recording;
  recording.chartFacts = [
    ...(recording.chartFacts || []).filter(
      (fact) => fact.label !== "Spotify popularity"
    ),
    {
      label: "Spotify popularity",
      value: `${spotify.spotifyPopularity} / 100`,
      asOf: new Date().toISOString().slice(0, 10),
      source: "Spotify",
      description:
        "An algorithmic score influenced by total and recent plays; it is not a lifetime stream count."
    }
  ];
  recording.sources = [...new Set([...(recording.sources || []), "Spotify"])];
  recording.sourceFacts = [
    ...(recording.sourceFacts || []).filter(
      (fact) => fact.source !== "Spotify"
    ),
    {
      source: "Spotify",
      fields: ["track link", "popularity score"],
      retrievedAt: new Date().toISOString(),
      confidence: "matched track metadata"
    }
  ];
  return recording;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin"
  });
  response.end(JSON.stringify(body));
}

async function readJson(request, maximumBytes = 64 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maximumBytes) {
      const error = new Error("Request is too large");
      error.code = "TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function authenticatedUser(request) {
  return authenticate(request.headers.authorization);
}

async function sendStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalizePath(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "content-security-policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; media-src https:; connect-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    });
    response.end(content);
  } catch {
    if (extname(requested)) {
      sendJson(response, 404, { error: "Asset not found" });
      return;
    }
    const index = await readFile(join(root, "index.html"));
    response.writeHead(200, {
      "content-type": contentTypes[".html"],
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "content-security-policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; media-src https:; connect-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    });
    response.end(index);
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/api/capabilities") {
    sendJson(response, 200, {
      globalSearch: true,
      applePlayback: true,
      exactSpotifyLinks: Boolean(
        process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
      ),
      audioIdentification: audioIdentificationConfigured(),
      openClawAssistant: openClawConfigured(),
      authenticatedLibrary: libraryConfigured()
    });
    return;
  }

  if (url.pathname === "/api/assistant" && request.method === "POST") {
    const clientKey = request.headers.authorization
      || request.socket.remoteAddress
      || "anonymous";
    const allowance = await rateLimit(`assistant:${clientKey}`, {
      limit: 12,
      windowSeconds: 60
    });
    if (!allowance.allowed) {
      sendJson(response, 429, { error: "Assistant rate limit exceeded" });
      return;
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of request) {
      total += chunk.length;
      if (total > 64 * 1024) {
        sendJson(response, 413, { error: "Assistant request is too large" });
        return;
      }
      chunks.push(chunk);
    }

    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const answer = await askOpenClaw(body.prompt, body.context);
      sendJson(response, 200, answer);
    } catch (error) {
      if (error.code === "NOT_CONFIGURED") {
        sendJson(response, 503, {
          error: "OpenClaw assistant is not configured",
          required: ["OPENCLAW_BASE_URL", "OPENCLAW_API_KEY"]
        });
        return;
      }
      if (error.code === "EMPTY_PROMPT" || error instanceof SyntaxError) {
        sendJson(response, 400, {
          error: error instanceof SyntaxError
            ? "Assistant request must be valid JSON"
            : error.message
        });
        return;
      }
      sendJson(response, 502, { error: "OpenClaw assistant unavailable" });
    }
    return;
  }

  if (url.pathname === "/api/identify" && request.method === "POST") {
    const chunks = [];
    let total = 0;
    for await (const chunk of request) {
      total += chunk.length;
      if (total > 10 * 1024 * 1024) {
        sendJson(response, 413, { error: "Audio clip must be 10 MB or smaller" });
        return;
      }
      chunks.push(chunk);
    }

    try {
      const match = await identifyAudio(
        Buffer.concat(chunks),
        request.headers["content-type"] || "audio/mpeg"
      );
      if (!match.matched) {
        sendJson(response, 200, { matched: false, results: [] });
        return;
      }
      const query = `${match.title} ${match.artist}`;
      const search = await federatedSearch(query);
      sendJson(response, 200, { ...match, query, ...search });
    } catch (error) {
      if (error.code === "NOT_CONFIGURED") {
        sendJson(response, 503, {
          error: "Audio identification is not configured",
          required: [
            "ACRCLOUD_HOST",
            "ACRCLOUD_ACCESS_KEY",
            "ACRCLOUD_ACCESS_SECRET"
          ]
        });
        return;
      }
      if (error.code === "EMPTY_AUDIO") {
        sendJson(response, 400, { error: error.message });
        return;
      }
      sendJson(response, 502, { error: "Audio identification provider unavailable" });
    }
    return;
  }

  if (url.pathname === "/api/v1/library" || url.pathname.startsWith("/api/v1/library/")) {
    try {
      const user = await authenticatedUser(request);
      if (request.method === "GET") {
        sendJson(response, 200, { saved: await listSaved(user.id) });
      } else if (request.method === "POST" && url.pathname === "/api/v1/library") {
        const body = await readJson(request);
        if (!body.slug || !body.title || !body.artist) {
          sendJson(response, 400, { error: "slug, title, and artist are required" });
          return;
        }
        sendJson(response, 201, await saveRecording(user.id, body));
      } else if (request.method === "DELETE") {
        const slug = decodeURIComponent(url.pathname.slice("/api/v1/library/".length));
        if (!slug) {
          sendJson(response, 400, { error: "Recording slug is required" });
          return;
        }
        await removeSaved(user.id, slug);
        response.writeHead(204).end();
      } else {
        sendJson(response, 405, { error: "Method not allowed" });
      }
    } catch (error) {
      sendJson(response, error.code === "UNAUTHORIZED" ? 401 : error.code === "NOT_CONFIGURED" ? 503 : 502, {
        error: error.message
      });
    }
    return;
  }

  if (url.pathname === "/api/v1/history") {
    try {
      const user = await authenticatedUser(request);
      if (request.method === "GET") {
        sendJson(response, 200, { history: await listHistory(user.id) });
      } else if (request.method === "POST") {
        const body = await readJson(request);
        if (!String(body.query || "").trim()) {
          sendJson(response, 400, { error: "Search query is required" });
          return;
        }
        await addHistory(user.id, body.query);
        response.writeHead(204).end();
      } else if (request.method === "DELETE") {
        await clearHistory(user.id);
        response.writeHead(204).end();
      } else {
        sendJson(response, 405, { error: "Method not allowed" });
      }
    } catch (error) {
      sendJson(response, error.code === "UNAUTHORIZED" ? 401 : error.code === "NOT_CONFIGURED" ? 503 : 502, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/v1/account/export" || url.pathname === "/api/v1/account") {
    try {
      const user = await authenticatedUser(request);
      if (url.pathname.endsWith("/export") && request.method === "GET") {
        sendJson(response, 200, await exportAccount(user.id));
      } else if (url.pathname === "/api/v1/account" && request.method === "DELETE") {
        await deleteAccount(user.id);
        response.writeHead(204).end();
      } else {
        sendJson(response, 405, { error: "Method not allowed" });
      }
    } catch (error) {
      sendJson(response, error.code === "UNAUTHORIZED" ? 401 : error.code === "NOT_CONFIGURED" ? 503 : 502, { error: error.message });
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/api/status") {
    sendJson(response, 200, {
      status: "ok",
      version: "0.1.0",
      uptimeSeconds: Math.round(process.uptime()),
      providers: {
        musicBrainz: "enabled",
        appleMusic: "enabled",
        coverArtArchive: "enabled",
        spotify: process.env.SPOTIFY_CLIENT_ID
          && process.env.SPOTIFY_CLIENT_SECRET
          ? "configured"
          : "search-fallback",
        audioIdentification: audioIdentificationConfigured()
          ? "configured"
          : "not-configured",
        openClaw: openClawConfigured() ? "configured" : "not-configured"
      },
      cache: cacheStatus()
    });
    return;
  }

  if (url.pathname.startsWith("/api/apple-previews/")) {
    const id = decodeURIComponent(
      url.pathname.slice("/api/apple-previews/".length)
    );
    try {
      const recording = await lookupAppleTrack(id);
      if (!recording.previewUrl) {
        sendJson(response, 404, { error: "Preview unavailable" });
        return;
      }
      const headers = {};
      if (request.headers.range) headers.range = request.headers.range;
      const upstream = await fetch(recording.previewUrl, {
        headers,
        signal: AbortSignal.timeout(8000)
      });
      if (!upstream.ok && upstream.status !== 206) {
        sendJson(response, 502, { error: "Preview provider unavailable" });
        return;
      }
      const responseHeaders = {
        "content-type": "audio/mp4",
        "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
        "cache-control": "public, max-age=3600",
        "x-content-type-options": "nosniff"
      };
      for (const name of ["content-length", "content-range", "etag"]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders[name] = value;
      }
      response.writeHead(upstream.status, responseHeaders);
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      Readable.fromWeb(upstream.body).pipe(response);
    } catch {
      sendJson(response, 502, { error: "Preview provider unavailable" });
    }
    return;
  }

  if (url.pathname === "/api/search") {
    const query = url.searchParams.get("q") || "";
    const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    const search = query
      ? await cached(
          `search:v1:${query.toLowerCase()}:${offset}`,
          () => federatedSearch(query, { offset }),
          { ttlSeconds: 300, staleSeconds: 900 }
        )
      : {
          results: [],
          localCount: 0,
          globalCount: 0,
          remoteStatus: "ok",
          offset: 0,
          nextOffset: 20,
          hasMore: false
        };
    sendJson(response, 200, {
      query,
      ...search
    });
    return;
  }

  if (url.pathname === "/api/suggest") {
    const query = (url.searchParams.get("q") || "").trim();
    if (query.length < 2) {
      sendJson(response, 200, { query, suggestions: [] });
      return;
    }
    const local = searchRecordings(query, 5).map((result) => ({
      ...result,
      source: "Liner Notes",
      external: false
    }));
    const applePayload = await searchAppleMusic(query, 8).catch(() => ({
      results: []
    }));
    const seen = new Set(
      local.map((result) => `${result.title}::${result.artist}`.toLowerCase())
    );
    const apple = (applePayload.results || applePayload)
      .filter((result) => {
        const key = `${result.title}::${result.artist}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, Math.max(0, 8 - local.length));
    sendJson(response, 200, {
      query,
      suggestions: [...local, ...apple].slice(0, 8)
    });
    return;
  }

  if (url.pathname === "/api/discover") {
    sendJson(response, 200, {
      featured: getFeaturedRecordings(),
      genres: getGenres()
    });
    return;
  }

  if (url.pathname.startsWith("/api/artists/")) {
    const slug = decodeURIComponent(url.pathname.slice("/api/artists/".length));
    const artist = getArtistProfile(slug);
    if (!artist) {
      sendJson(response, 404, { error: "Artist not found" });
      return;
    }
    sendJson(response, 200, artist);
    return;
  }

  if (url.pathname.startsWith("/api/external-artists/")) {
    const id = decodeURIComponent(
      url.pathname.slice("/api/external-artists/".length)
    );
    try {
      const artist = await lookupMusicBrainzArtist(id);
      const wikidataUrl = artist.urls.find(
        (relation) => relation.type === "wikidata"
      )?.url;
      const wikimedia = await lookupWikimediaArtist(wikidataUrl).catch(() => null);
      const relationUrl = (type, predicate = () => true) =>
        artist.urls.find(
          (relation) => relation.type === type && predicate(relation.url)
        )?.url || null;
      Object.assign(artist, {
        summary: wikimedia?.summary || artist.summary,
        imageUrl: wikimedia?.imageUrl || null,
        wikipediaUrl: wikimedia?.wikipediaUrl || null,
        wikidataUrl: wikimedia?.wikidataUrl || wikidataUrl || null,
        officialUrl: relationUrl("official homepage"),
        spotifyUrl: relationUrl(
          "free streaming",
          (value) => value.startsWith("https://open.spotify.com/artist/")
        ),
        lyricsUrl: relationUrl("lyrics")
      });
      sendJson(response, 200, artist);
    } catch {
      sendJson(response, 502, { error: "Global artist lookup unavailable" });
    }
    return;
  }

  if (url.pathname.startsWith("/api/apple-artists/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/apple-artists/".length));
    try {
      sendJson(response, 200, await lookupAppleArtist(id));
    } catch {
      sendJson(response, 502, { error: "Commercial artist lookup unavailable" });
    }
    return;
  }

  if (url.pathname.startsWith("/api/genres/")) {
    const slug = decodeURIComponent(url.pathname.slice("/api/genres/".length));
    const genre = getGenre(slug);
    if (!genre) {
      sendJson(response, 404, { error: "Genre not found" });
      return;
    }
    sendJson(response, 200, genre);
    return;
  }

  if (url.pathname.startsWith("/api/songs/")) {
    const slug = decodeURIComponent(url.pathname.slice("/api/songs/".length));
    const recording = getRecording(slug);
    if (!recording) {
      sendJson(response, 404, { error: "Song not found" });
      return;
    }
    sendJson(response, 200, recording);
    return;
  }

  if (url.pathname.startsWith("/api/external-songs/")) {
    const id = decodeURIComponent(
      url.pathname.slice("/api/external-songs/".length)
    );
    try {
      const recording = await lookupMusicBrainzRecording(id);
      await enrichArtistContext(recording, recording.artist.id);
      if (recording.artist.id) {
        const releaseDescription = recording.releaseStatus
          ? `${recording.releaseStatus.toLowerCase()} release`
          : "release";
        recording.story = [
          `“${recording.title}” is a recording credited to ${recording.artist.name}.`,
          recording.album !== "Release unknown"
            ? `MusicBrainz associates it with the ${releaseDescription} “${recording.album}”${recording.releaseDate ? `, dated ${recording.releaseDate}` : ""}.`
            : null,
          recording.genres.length
            ? `${recording.artist.name} is associated with ${recording.genres.join(", ")}.`
            : null
        ].filter(Boolean).join(" ");
      }
      const coverArt = await lookupCoverArt(
        recording.releaseMusicBrainzId
      ).catch(() => null);
      if (coverArt) {
        Object.assign(recording, {
          artworkUrl: coverArt.artworkUrl,
          thumbnailUrl: coverArt.thumbnailUrl,
          sources: [...new Set([...recording.sources, coverArt.source])],
          sourceFacts: [
            ...recording.sourceFacts,
            {
              source: coverArt.source,
              fields: ["release artwork"],
              retrievedAt: new Date().toISOString(),
              confidence: "release-linked metadata"
            }
          ]
        });
      }
      const applePayload = await searchAppleMusic(
        `${recording.title} ${recording.artist.name}`,
        5
      ).catch(() => ({ results: [] }));
      const appleResults = applePayload.results || applePayload;
      const exactApple = appleResults.find(
        (candidate) =>
          candidate.title.toLowerCase() === recording.title.toLowerCase()
          && candidate.artist.toLowerCase() === recording.artist.name.toLowerCase()
      ) || appleResults[0];
      if (exactApple) {
        Object.assign(recording, {
          appleTrackId: exactApple.appleTrackId,
          appleMusicUrl: exactApple.appleMusicUrl,
          previewUrl: localApplePreviewUrl(exactApple.appleTrackId),
          artworkUrl: recording.artworkUrl || exactApple.artworkUrl,
          isStreamable: exactApple.isStreamable,
          providers: ["MusicBrainz", "Apple Music"]
        });
        recording.sources = [...new Set([...recording.sources, "Apple Music"])];
        recording.sourceFacts.push({
          source: "Apple Music",
          fields: ["playback link", "preview", "artwork"],
          retrievedAt: new Date().toISOString(),
          confidence: "title and artist match"
        });
      }
      addSpotifyPopularity(
        recording,
        await resolveSpotifyTrack(recording.title, recording.artist.name)
      );
      sendJson(response, 200, recording);
    } catch {
      sendJson(response, 502, { error: "Global recording lookup unavailable" });
    }
    return;
  }

  if (url.pathname.startsWith("/api/apple-songs/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/apple-songs/".length));
    try {
      const recording = await lookupAppleTrack(id);
      const musicBrainzMatch = await findMusicBrainzMatch(
        recording.title,
        recording.artist.name
      );
      const musicBrainzArtist = musicBrainzMatch?.artistMusicBrainzId
        ? { id: musicBrainzMatch.artistMusicBrainzId }
        : await findMusicBrainzArtist(recording.artist.name);
      await enrichArtistContext(
        recording,
        musicBrainzArtist?.id
      );
      recording.musicBrainzId = musicBrainzMatch?.musicBrainzId || null;
      recording.musicBrainzUrl = recording.musicBrainzId
        ? `https://musicbrainz.org/recording/${recording.musicBrainzId}`
        : null;
      recording.previewUrl = localApplePreviewUrl(recording.appleTrackId);
      recording.story = [
        `“${recording.title}” is a recording by ${recording.artist.name}.`,
        recording.album !== "Release unknown"
          ? `Apple Music lists it on “${recording.album}”${recording.releaseDate ? `, released ${recording.releaseDate}` : ""}.`
          : null,
        recording.genres.length
          ? `The recording is categorized as ${recording.genres.join(", ")}.`
          : null
      ].filter(Boolean).join(" ");
      addSpotifyPopularity(
        recording,
        await resolveSpotifyTrack(recording.title, recording.artist.name)
      );
      sendJson(response, 200, recording);
    } catch {
      sendJson(response, 502, { error: "Commercial recording lookup unavailable" });
    }
    return;
  }

  if (url.pathname.startsWith("/api/playback/")) {
    const slug = decodeURIComponent(url.pathname.slice("/api/playback/".length));
    const recording = getRecording(slug);
    if (!recording) {
      sendJson(response, 404, { error: "Song not found" });
      return;
    }
    const applePayload = await searchAppleMusic(
      `${recording.title} ${recording.artist.name}`,
      5
    ).catch(() => ({ results: [] }));
    const appleResults = applePayload.results || applePayload;
    const exactApple = appleResults.find(
      (candidate) =>
        candidate.title.toLowerCase() === recording.title.toLowerCase()
        && candidate.artist.toLowerCase() === recording.artist.name.toLowerCase()
    ) || appleResults[0];
    const spotify = await resolveSpotifyTrack(
      recording.title,
      recording.artist.name
    );
    sendJson(response, 200, {
      ...spotify,
      appleMusicUrl: exactApple?.appleMusicUrl || null,
      previewUrl: localApplePreviewUrl(exactApple?.appleTrackId),
      artworkUrl: exactApple?.artworkUrl || null
    });
    return;
  }

  await sendStatic(response, url.pathname);
}

export const server = createServer((request, response) => {
  handleRequest(request, response).catch(() => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    sendJson(response, 500, { error: "Internal server error" });
  });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

export function startServer(listenPort = port) {
  server.listen(listenPort, () => {
    console.log(`Liner Notes is listening on http://localhost:${listenPort}`);
  });
  return server;
}
