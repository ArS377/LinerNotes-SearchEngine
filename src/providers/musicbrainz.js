const apiRoot = "https://musicbrainz.org/ws/2";
const cache = new Map();
const inFlight = new Map();
const cacheTtlMs = 10 * 60 * 1000;
const maxCacheEntries = 200;
let nextRequestAt = 0;
let requestQueue = Promise.resolve();
let fetchImplementation = globalThis.fetch;

function userAgent() {
  const contact = process.env.MUSICBRAINZ_CONTACT || "https://github.com/ArS377/SearchEngine";
  return `LinerNotesSearch/0.1.0 (${contact})`;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > cacheTtlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value) {
  if (cache.size >= maxCacheEntries) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { createdAt: Date.now(), value });
}

async function withRateLimit(request) {
  const queued = requestQueue.then(async () => {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    nextRequestAt = Date.now() + 1100;
    return request();
  });
  requestQueue = queued.catch(() => {});
  return queued;
}

async function requestMusicBrainz(path, params) {
  const url = new URL(`${apiRoot}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  const format = params.fmt || "json";
  url.searchParams.set("fmt", format);

  const cacheKey = url.toString();
  const cached = readCache(cacheKey);
  if (cached) return cached;
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const fetchResponse = async () => {
      const response = await fetchImplementation(url, {
        headers: {
          accept: "application/json",
          "user-agent": userAgent()
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        const error = new Error(`MusicBrainz returned ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return format === "txt" ? response.text() : response.json();
    };
  const pending = withRateLimit(fetchResponse)
    .catch((error) => {
      if (error.status === 503) return withRateLimit(fetchResponse);
      throw error;
    })
    .then((body) => {
      writeCache(cacheKey, body);
      return body;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, pending);
  return pending;
}

function artistCreditText(credits = []) {
  return credits
    .map((credit) => {
      if (typeof credit === "string") return credit;
      return `${credit.name || credit.artist?.name || ""}${credit.joinphrase || ""}`;
    })
    .join("")
    .trim();
}

function primaryArtist(credits = []) {
  const credit = credits.find((candidate) => typeof candidate !== "string");
  return credit?.artist || null;
}

function firstRelease(recording) {
  return recording.releases?.find((release) => release.status === "Official")
    || recording.releases?.[0]
    || null;
}

function normalizedArtistMetadata(artist) {
  const urls = artist.relations
    ?.map((relation) => ({
      type: relation.type,
      url: relation.url?.resource
    }))
    .filter((relation) => relation.url) || [];

  return {
    id: artist.id,
    name: artist.name,
    sortName: artist["sort-name"] || artist.name,
    type: artist.type || "Artist",
    country: artist.country || artist.area?.name || "Country unavailable",
    lifeSpan: artist["life-span"] || null,
    disambiguation: artist.disambiguation || null,
    genres: (artist.genres || [])
      .sort((left, right) => (right.count || 0) - (left.count || 0))
      .slice(0, 8)
      .map((genre) => genre.name),
    genreVotes: Object.fromEntries((artist.genres || []).map((genre) => [genre.name, genre.count || 0])),
    urls
  };
}

function formatDuration(length) {
  if (!Number.isFinite(length)) return null;
  const seconds = Math.round(length / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function externalSlug(id) {
  return `mbid-${id}`;
}

export function normalizeMusicBrainzResult(recording) {
  const artist = primaryArtist(recording["artist-credit"]);
  const release = firstRelease(recording);
  const genres = [...(recording.genres?.length ? recording.genres : recording.tags || [])]
    .sort((left, right) => (right.count || 0) - (left.count || 0))
    .slice(0, 12)
    .map((genre) => genre.name);

  return {
    source: "MusicBrainz",
    external: true,
    musicBrainzId: recording.id,
    slug: externalSlug(recording.id),
    title: recording.title || "Untitled recording",
    artist: artistCreditText(recording["artist-credit"]) || "Unknown artist",
    artistMusicBrainzId: artist?.id || null,
    album: release?.title || "Release unknown",
    releaseMusicBrainzId: release?.id || null,
    releaseStatus: release?.status || null,
    releaseDate: recording["first-release-date"] || release?.date || null,
    version: recording.disambiguation || "MusicBrainz recording",
    genres,
    genreVotes: Object.fromEntries((recording.genres?.length ? recording.genres : recording.tags || []).map((genre) => [genre.name, genre.count || 0])),
    duration: formatDuration(recording.length),
    color: "#496b66",
    matchReason: "global catalog match",
    score: Number(recording.score || 0)
  };
}

export async function searchMusicBrainz(query, limit = 20, offset = 0) {
  const body = await requestMusicBrainz("recording", {
    query,
    limit: String(limit),
    offset: String(offset)
  });
  return {
    results: (body.recordings || []).map(normalizeMusicBrainzResult),
    total: Number(body.count || 0),
    offset: Number(body.offset || offset)
  };
}

export async function listMusicBrainzGenres() {
  // The documented text format returns the complete list without pagination.
  const body = await requestMusicBrainz("genre/all", { fmt: "txt" });
  const names = [...new Set(body.split(/\r?\n/).map((name) => name.trim()).filter(Boolean))];
  if (!names.length) throw new Error("MusicBrainz returned an empty genre catalog");
  return names;
}

export async function searchMusicBrainzArtists(query, limit = 10) {
  const body = await requestMusicBrainz("artist", {
    query,
    limit: String(limit),
    offset: "0"
  });
  return (body.artists || []).map((artist) => ({
    id: artist.id,
    name: artist.name,
    sortName: artist["sort-name"] || artist.name,
    country: artist.country || artist.area?.name || null,
    disambiguation: artist.disambiguation || null,
    score: Number(artist.score || 0),
    genres: [...(artist.genres || []), ...(artist.tags || [])].filter((tag) => (tag.count ?? 1) > 0).map((tag) => tag.name),
    genreVotes: Object.fromEntries([...(artist.genres || []), ...(artist.tags || [])].map((tag) => [tag.name, tag.count || 0]))
  }));
}

export async function lookupMusicBrainzRecording(id) {
  const recording = await requestMusicBrainz(`recording/${encodeURIComponent(id)}`, {
    inc: "artist-credits+releases+genres+url-rels"
  });
  const result = normalizeMusicBrainzResult(recording);
  const artist = primaryArtist(recording["artist-credit"]);
  const release = firstRelease(recording);

  const spotifyUrl = recording.relations
    ?.map((relation) => relation.url?.resource)
    .find((url) => /^https:\/\/open\.spotify\.com\/track\//.test(url));

  return {
    id: `musicbrainz-${recording.id}`,
    slug: result.slug,
    external: true,
    musicBrainzId: recording.id,
    title: result.title,
    album: result.album,
    releaseMusicBrainzId: result.releaseMusicBrainzId,
    releaseStatus: result.releaseStatus,
    releaseDate: result.releaseDate,
    duration: result.duration,
    genres: result.genres,
    version: result.version,
    color: result.color,
    spotifyUrl: spotifyUrl || null,
    spotifySearchUrl: `https://open.spotify.com/search/${encodeURIComponent(
      `${result.title} ${result.artist}`
    )}`,
    musicBrainzUrl: `https://musicbrainz.org/recording/${recording.id}`,
    lyrics: {
      status: "unavailable",
      message:
        "Lyrics are not included in MusicBrainz. A licensed lyrics provider is required."
    },
    story:
      "This recording was found in the global MusicBrainz catalog. Rich editorial context has not been added to the local index yet.",
    credits: [
      ["Artist credit", result.artist],
      ["Release", release?.title || "Unknown"],
      ["Release status", release?.status || "Unknown"],
      ["MusicBrainz ID", recording.id]
    ],
    chartFacts: [],
    sources: ["MusicBrainz"],
    sourceFacts: [
      {
        source: "MusicBrainz",
        fields: ["identity", "artist credit", "release", "duration", "genres"],
        retrievedAt: new Date().toISOString(),
        confidence: "canonical metadata"
      }
    ],
    related: [],
    artist: {
      id: artist?.id || null,
      slug: artist?.id ? `mbid-${artist.id}` : null,
      name: result.artist,
      country: artist?.country || "Country unavailable",
      summary:
        "This artist is available through the global MusicBrainz catalog but does not yet have a locally enriched profile.",
      sources: ["MusicBrainz"]
    }
  };
}

export async function lookupMusicBrainzArtistMetadata(id) {
  const artist = await requestMusicBrainz(`artist/${encodeURIComponent(id)}`, {
    inc: "genres+url-rels"
  });
  return normalizedArtistMetadata(artist);
}

export async function lookupMusicBrainzArtist(id, limit = 50) {
  const [artist, recordings] = await Promise.all([
    lookupMusicBrainzArtistMetadata(id),
    requestMusicBrainz("recording", {
      query: `arid:${id}`,
      limit: String(limit),
      offset: "0"
    })
  ]);

  const normalizedRecordings = (recordings.recordings || [])
    .map(normalizeMusicBrainzResult)
    .sort((left, right) => right.score - left.score);
  return {
    id: artist.id,
    slug: `mbid-${artist.id}`,
    external: true,
    source: "MusicBrainz",
    name: artist.name,
    sortName: artist.sortName,
    type: artist.type || "Artist",
    country: artist.country || artist.area?.name || "Country unavailable",
    lifeSpan: artist.lifeSpan,
    disambiguation: artist.disambiguation || null,
    summary:
      artist.disambiguation
      || `${artist.type || "Artist"} profile from the global MusicBrainz catalog.`,
    genres: artist.genres,
    urls: artist.urls,
    recordings: normalizedRecordings
  };
}

export function setMusicBrainzFetchForTests(fetchFn) {
  fetchImplementation = fetchFn;
  cache.clear();
  inFlight.clear();
  nextRequestAt = 0;
  requestQueue = Promise.resolve();
}
