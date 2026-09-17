import { artists, recordings } from "./catalog.js";
import { normalize } from "./search.js";

const artistById = new Map(artists.map((artist) => [artist.id, artist]));

function decadeOf(value) {
  const year = Number.parseInt(String(value || "").slice(0, 4), 10);
  return Number.isFinite(year) ? `${Math.floor(year / 10) * 10}s` : null;
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function rankedEntries(map, limit = 5) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function classifySearchIntent(rawQuery) {
  const query = normalize(rawQuery || "");
  const exactArtist = artists.find((artist) => normalize(artist.name) === query);
  const approximateArtist = query.split(" ").length >= 2
    ? artists.find((artist) => {
        const candidate = normalize(artist.name);
        return candidate.split(" ").length === query.split(" ").length
          && Math.abs(candidate.length - query.length) <= 2
          && editDistance(candidate, query) <= 2;
      })
    : null;
  const namedArtist = artists.find((artist) => query.includes(normalize(artist.name)));
  const indexedLyricMatch = query.length >= 12 && recordings.some((recording) =>
    (recording.lyricSearchFragments || []).some((fragment) => normalize(fragment).includes(query))
  );
  const tokens = query.split(" ").filter(Boolean);

  if (exactArtist) {
    return { type: "artist", confidence: 0.99, entities: { artist: exactArtist.name } };
  }
  if (approximateArtist) {
    return { type: "artist", confidence: 0.9, entities: { artist: approximateArtist.name } };
  }
  if (namedArtist && query !== normalize(namedArtist.name)) {
    return { type: "mixed", confidence: 0.92, entities: { artist: namedArtist.name } };
  }
  if (indexedLyricMatch) {
    return { type: "lyrics", confidence: 0.96, entities: {} };
  }
  if (tokens.length >= 7 || /\b(lyrics?|line|words|goes like)\b/.test(query)) {
    return { type: "lyrics", confidence: 0.78, entities: {} };
  }
  return { type: "track", confidence: tokens.length > 1 ? 0.72 : 0.58, entities: {} };
}

export function resolveSearchIntent(initialIntent, rawQuery, results = []) {
  if (initialIntent.type !== "track") return initialIntent;
  const query = normalize(rawQuery || "");
  const exactArtistResults = results.filter((result) => normalize(result.artist || "") === query);
  const distinctTitles = new Set(exactArtistResults.map((result) => normalize(result.title || "")));
  if (exactArtistResults.length < 3 || distinctTitles.size < 3) return initialIntent;
  return {
    type: "artist",
    confidence: 0.94,
    entities: { artist: exactArtistResults[0].artist }
  };
}

export function catalogSummaries() {
  return recordings.map((recording) => {
    const artist = artistById.get(recording.artistId);
    return {
      slug: recording.slug,
      title: recording.title,
      artist: artist?.name || "Unknown artist",
      artistSlug: artist?.slug || null,
      album: recording.album,
      releaseDate: recording.releaseDate,
      version: recording.version,
      genres: recording.genres,
      color: recording.color,
      source: "Liner Notes",
      external: false,
      prominence: recording.prominence
    };
  });
}

export function buildMusicInsights({ bookmarks = [], recentQueries = [] } = {}) {
  const safeBookmarks = Array.isArray(bookmarks) ? bookmarks.slice(0, 200) : [];
  const safeQueries = Array.isArray(recentQueries) ? recentQueries.slice(0, 50) : [];
  const genreCounts = new Map();
  const artistCounts = new Map();
  const decadeCounts = new Map();

  for (const item of safeBookmarks) {
    increment(artistCounts, String(item.artist || "Unknown artist"));
    for (const genre of Array.isArray(item.genres) ? item.genres : []) {
      increment(genreCounts, String(genre).toLowerCase());
    }
    increment(decadeCounts, decadeOf(item.releaseDate));
  }

  const bookmarkCount = safeBookmarks.length;
  const uniqueArtists = artistCounts.size;
  const uniqueGenres = genreCounts.size;
  const diversityScore = bookmarkCount
    ? Math.min(100, Math.round(((uniqueArtists / bookmarkCount) * 60) + (Math.min(uniqueGenres, 8) / 8 * 40)))
    : 0;

  return {
    profile: {
      bookmarkCount,
      searchCount: safeQueries.length,
      uniqueArtists,
      uniqueGenres,
      diversityScore,
      topGenres: rankedEntries(genreCounts),
      topArtists: rankedEntries(artistCounts),
      decades: rankedEntries(decadeCounts)
    },
    recommendations: [],
    generatedAt: new Date().toISOString(),
    method: "bookmark-discovery-v2"
  };
}
