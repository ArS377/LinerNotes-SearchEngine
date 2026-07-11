import { searchRecordings, normalize } from "./search.js";
import { searchMusicBrainz } from "./providers/musicbrainz.js";
import { searchAppleMusic } from "./providers/apple.js";
import { searchSpotifyTracks } from "./providers/spotify.js";

function dedupeKey(result) {
  return normalize(`${result.title} ${result.artist}`);
}

function globalRelevance(query, result) {
  const normalizedQuery = normalize(query);
  const title = normalize(result.title);
  const artist = normalize(result.artist);
  const combined = `${title} ${artist}`;
  const queryTokens = new Set(normalizedQuery.split(" ").filter(Boolean));
  const candidateTokens = new Set(combined.split(" ").filter(Boolean));
  const matchedTokens = [...queryTokens].filter((token) => candidateTokens.has(token));
  const tokenCoverage = queryTokens.size
    ? matchedTokens.length / queryTokens.size
    : 0;

  let score = tokenCoverage * 500;
  if (combined === normalizedQuery) score += 1000;
  else if (combined.includes(normalizedQuery)) score += 500;
  if (title === normalizedQuery) score += 400;
  else if (normalizedQuery.includes(title)) score += 180;
  if (artist === normalizedQuery) score += 300;
  else if (normalizedQuery.includes(artist)) score += 160;
  score += Number(result.score || 0);
  return score;
}

function isTitleIntentMatch(query, result) {
  const normalizedQuery = normalize(query);
  const title = normalize(result.title);
  return title === normalizedQuery || title.startsWith(`${normalizedQuery} `);
}

function prominenceScore(result) {
  if (!result.external) return 3000 + Number(result.relevanceScore || 0);
  if (Number.isFinite(result.spotifyPopularity)) {
    return 2000 + result.spotifyPopularity;
  }
  if (Number.isFinite(result.providerRank)) {
    return 1000 - result.providerRank;
  }
  return Number(result.score || 0);
}

function queryNamesArtist(query, results) {
  const normalizedQuery = ` ${normalize(query)} `;
  return results.some((result) => {
    const artist = normalize(result.artist);
    return artist.length >= 3 && normalizedQuery.includes(` ${artist} `);
  });
}

function isExactArtistIntent(query, results) {
  const normalizedQuery = normalize(query);
  return results.some((result) => normalize(result.artist) === normalizedQuery);
}

function unifiedRelevance(query, result) {
  const textScore = globalRelevance(query, result);
  if (result.external) return textScore;
  const localSignal = Number(result.relevanceScore || 0) * 8;
  const lyricBonus = result.matchReason === "lyric match" ? 300 : 0;
  return Math.max(textScore, localSignal + lyricBonus);
}

function mergeProviderResult(primary, secondary) {
  return {
    ...primary,
    providers: [...new Set([
      ...(primary.providers || [primary.source]),
      ...(secondary.providers || [secondary.source])
    ])],
    appleTrackId: primary.appleTrackId || secondary.appleTrackId,
    appleMusicUrl: primary.appleMusicUrl || secondary.appleMusicUrl,
    previewUrl: primary.previewUrl || secondary.previewUrl,
    artworkUrl: primary.artworkUrl || secondary.artworkUrl,
    thumbnailUrl: primary.thumbnailUrl || secondary.thumbnailUrl,
    spotifyId: primary.spotifyId || secondary.spotifyId,
    spotifyUrl: primary.spotifyUrl || secondary.spotifyUrl,
    spotifyPopularity:
      primary.spotifyPopularity ?? secondary.spotifyPopularity ?? null,
    providerRank: primary.providerRank ?? secondary.providerRank ?? null,
    isrc: primary.isrc || secondary.isrc,
    duration: primary.duration || secondary.duration,
    genres: primary.genres?.length ? primary.genres : secondary.genres
  };
}

export async function federatedSearch(
  query,
  {
    musicBrainzSearch = searchMusicBrainz,
    appleSearch = searchAppleMusic,
    spotifySearch = searchSpotifyTracks,
    limit = 20,
    offset = 0
  } = {}
) {
  const local = (offset === 0 ? searchRecordings(query, limit) : []).map((result) => ({
    ...result,
    source: "Liner Notes",
    external: false
  }));

  const [musicBrainzResponse, appleResponse, spotifyResponse] = await Promise.allSettled([
    musicBrainzSearch(query, limit, offset),
    appleSearch(query, limit, offset),
    offset === 0
      ? spotifySearch(query, limit)
      : Promise.resolve({ results: [], configured: true })
  ]);
  const musicBrainzPayload = musicBrainzResponse.status === "fulfilled"
    ? musicBrainzResponse.value
    : { results: [], total: 0 };
  const applePayload = appleResponse.status === "fulfilled"
    ? appleResponse.value
    : { results: [], total: 0 };
  const musicBrainz = Array.isArray(musicBrainzPayload)
    ? musicBrainzPayload
    : musicBrainzPayload.results;
  const appleResults = Array.isArray(applePayload)
    ? applePayload
    : applePayload.results;
  const apple = appleResults.map((result, index) => ({
    ...result,
    providerRank: offset + index
  }));
  const spotifyPayload = spotifyResponse.status === "fulfilled"
    ? spotifyResponse.value
    : { results: [], configured: true };
  const spotify = Array.isArray(spotifyPayload)
    ? spotifyPayload
    : spotifyPayload.results;
  const providerStatus = {
    musicBrainz: musicBrainzResponse.status === "fulfilled" ? "ok" : "unavailable",
    apple: appleResponse.status === "fulfilled" ? "ok" : "unavailable",
    spotify:
      spotifyResponse.status === "rejected"
        ? "unavailable"
        : spotifyPayload.configured === false
          ? "not-configured"
          : "ok"
  };

  const remoteMap = new Map();
  for (const result of [...musicBrainz, ...apple]) {
    const key = dedupeKey(result);
    const existing = remoteMap.get(key);
    remoteMap.set(key, existing ? mergeProviderResult(existing, result) : result);
  }
  const remote = [...remoteMap.values()];
  const spotifyByKey = new Map(spotify.map((result) => [dedupeKey(result), result]));
  for (const result of remote) {
    const spotifyResult = spotifyByKey.get(dedupeKey(result));
    if (spotifyResult) Object.assign(result, mergeProviderResult(result, spotifyResult));
  }

  const localByKey = new Map(local.map((result) => [dedupeKey(result), result]));
  for (const result of remote) {
    const key = dedupeKey(result);
    if (localByKey.has(key)) {
      localByKey.set(key, mergeProviderResult(localByKey.get(key), result));
    }
  }
  const enrichedLocal = [...localByKey.values()];
  const seen = new Set(enrichedLocal.map(dedupeKey));
  const uniqueRemote = remote
    .filter((result) => {
      const key = dedupeKey(result);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        globalRelevance(query, right) - globalRelevance(query, left)
    );

  const candidates = [...enrichedLocal, ...uniqueRemote];
  const hasArtistIntent = queryNamesArtist(query, candidates);
  const exactArtistIntent = isExactArtistIntent(query, candidates);
  const results = candidates
    .filter((result) => {
      if (!exactArtistIntent) return true;
      return normalize(result.artist) === normalize(query);
    })
    .sort(
      (left, right) => {
        if (!hasArtistIntent) {
          const leftTitleIntent = isTitleIntentMatch(query, left);
          const rightTitleIntent = isTitleIntentMatch(query, right);
          if (leftTitleIntent !== rightTitleIntent) {
            return rightTitleIntent - leftTitleIntent;
          }
          if (leftTitleIntent && rightTitleIntent) {
            const prominenceDifference =
              prominenceScore(right) - prominenceScore(left);
            if (prominenceDifference !== 0) return prominenceDifference;
          }
        }
        const relevanceDifference =
          unifiedRelevance(query, right) - unifiedRelevance(query, left);
        if (Math.abs(relevanceDifference) >= 100) return relevanceDifference;
        return (
          Number(right.spotifyPopularity ?? -1)
          - Number(left.spotifyPopularity ?? -1)
        ) || relevanceDifference;
      }
    )
    .slice(0, limit);

  return {
    results,
    localCount: enrichedLocal.length,
    globalCount: uniqueRemote.length,
    remoteStatus: Object.values(providerStatus).some((status) => status === "ok")
      ? "ok"
      : "unavailable",
    providerStatus,
    offset,
    nextOffset: offset + limit,
    hasMore:
      offset + limit < Number(musicBrainzPayload.total || 0)
      || offset + limit < Number(applePayload.total || 0)
  };
}
