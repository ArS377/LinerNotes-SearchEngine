import { getRecording } from "./catalog.js";
import { catalogSummaries } from "./music-intelligence.js";
import { lookupAppleTrack, searchAppleMusic } from "./providers/apple.js";
import { lookupMusicBrainzRecording, searchMusicBrainz, lookupMusicBrainzArtistMetadata, searchMusicBrainzArtists } from "./providers/musicbrainz.js";
import { cached } from "./services/cache.js";
import { discoveryRequestSchema } from "./contracts/discovery.js";
import { genreNames as genresOf, normalizeGenre as normalize, researchGenres, supportedGenres } from "./genre-research.js";

const weights = { balanced: { genre: 0.75, era: 0.25 }, genre: { genre: 1, era: 0 }, era: { genre: 0.25, era: 0.75 } };
const yearOf = (item) => { const year = Number.parseInt(item.releaseDate, 10); return year >= 1850 && year <= new Date().getUTCFullYear() + 1 ? year : null; };
const identity = (item) => `${normalize(item.artist)}::${normalize(item.title).replace(/\b(remaster(ed)?|\d{4} remaster(ed)?)\b/g, "").trim()}`;
const quote = (value) => `"${String(value).replace(/[\\"]/g, " ").slice(0, 150)}"`;
const overlap = (a, b) => a.filter((value) => b.includes(value));
const jaccard = (a, b) => { const union = new Set([...a, ...b]); return union.size ? overlap(a, b).length / union.size : 0; };
export function discoveryGenres(item) {
  return item.genreResearch?.selected || [];
}

export async function enrichSeedGenres(seed, dependencies = {}) {
  const search = dependencies.search || searchMusicBrainz;
  const findArtists = dependencies.findArtists || searchMusicBrainzArtists;
  const artistMetadata = dependencies.artistMetadata || lookupMusicBrainzArtistMetadata;
  const research = dependencies.research || researchGenres;
  let recording = { ...seed };
  let artist = null;
  let artistId = seed.artistMusicBrainzId;
  try {
    const payload = await search(`recording:${quote(seed.title)} AND artist:${quote(seed.artist)}`, 5);
    const match = payload.results.find((item) => normalize(item.title) === normalize(seed.title) && normalize(item.artist) === normalize(seed.artist));
    if (match) {
      artistId = match.artistMusicBrainzId || artistId;
      recording = { ...recording, genres: [...new Set([...genresOf(seed), ...genresOf(match)])], genreVotes: match.genreVotes };
    }
  } catch { /* Artist lookup can still supply explicitly labeled fallback evidence. */ }
  try {
    if (!artistId) {
      const matches = (await findArtists(`artist:${quote(seed.artist)}`, 5)).filter((item) => normalize(item.name) === normalize(seed.artist));
      if (matches.length === 1) artistId = matches[0].id;
    }
    if (artistId) {
      const match = await artistMetadata(artistId);
      if (normalize(match.name) === normalize(seed.artist)) artist = match;
    }
  } catch { /* Keep broad metadata, but don't claim strong similarity from it. */ }
  const genreResearch = await research(recording, artist);
  const usesArtist = genreResearch.entries.some((entry) => genreResearch.selected.includes(entry.name) && entry.level === "artist");
  return { ...recording, genres: [...new Set([...genresOf(recording), ...genresOf(artist || {})])], genreResearch, genreContext: usesArtist ? { level: "artist", name: artist.name, url: `https://musicbrainz.org/artist/${artistId}` } : { level: "recording" } };
}

function summary(data, slug) {
  return { ...data, slug, artist: typeof data.artist === "string" ? data.artist : data.artist?.name || "Unknown artist", source: data.source || (slug.startsWith("apple-") ? "Apple Music" : slug.startsWith("mbid-") ? "MusicBrainz" : "Liner Notes"), external: slug.startsWith("apple-") || slug.startsWith("mbid-"), genres: data.genres || [] };
}

export async function resolveSeed(slug) {
  let result;
  if (/^apple-\d+$/.test(slug)) result = await lookupAppleTrack(slug.slice(6));
  else if (/^mbid-[0-9a-f-]{36}$/i.test(slug)) result = await lookupMusicBrainzRecording(slug.slice(5));
  else result = getRecording(slug);
  if (!result) { const error = new Error("Recording not found. Choose a song from search."); error.status = 404; throw error; }
  const seed = summary(result, slug);
  if (!seed.genres.length) {
    try {
      const payload = await searchAppleMusic(`${seed.title} ${seed.artist}`, 5);
      const match = payload.results.find((item) => normalize(item.title) === normalize(seed.title) && normalize(item.artist) === normalize(seed.artist));
      if (match) { seed.genres = match.genres; seed.genreSource = "Apple Music"; }
    } catch { /* Missing tags remain unknown when the secondary catalog is unavailable. */ }
  }
  return enrichSeedGenres(seed);
}

export function rankCandidates(seed, candidates, options) {
  const selectedWeights = weights[options.focus] || weights.balanced;
  const seedGenres = discoveryGenres(seed), seedYear = yearOf(seed);
  const specificSeed = seedGenres.length > 0;
  const excluded = new Set([seed.slug, ...(options.excludeSlugs || [])]);
  const excludedIdentities = new Set(candidates.filter((item) => excluded.has(item.slug)).map(identity));
  const knownArtists = new Set((options.knownArtists || []).map(normalize));
  const seen = new Set([identity(seed)]);
  const pool = [];
  for (const item of candidates) {
    const key = identity(item), artist = normalize(item.artist);
    if (seen.has(key) || excluded.has(item.slug) || excludedIdentities.has(key)) continue;
    if (options.differentArtists && artist === normalize(seed.artist)) continue;
    if (options.unfamiliarArtists && knownArtists.has(artist)) continue;
    seen.add(key);
    const itemGenres = genresOf(item), shared = overlap(seedGenres, itemGenres);
    const itemYear = yearOf(item), gap = seedYear && itemYear ? Math.abs(seedYear - itemYear) : null;
    // Extra descriptive tags must not punish a well-described subgenre match.
    const genreScore = seedGenres.length ? 0.8 * shared.length / seedGenres.length + 0.2 * jaccard(genresOf(seed), itemGenres) : 0;
    const eraScore = gap === null ? 0 : Math.exp(-gap / 12);
    // Never fill the list with unrelated tracks merely to reach five results.
    if (!shared.length && !(options.focus === "era" && gap !== null && gap <= 5)) continue;
    if (options.focus !== "era" && !specificSeed) continue;
    if (options.focus === "era" && gap === null) continue;
    const score = selectedWeights.genre * genreScore + selectedWeights.era * eraScore;
    const reasons = [];
    if (shared.length) reasons.push(`Shares ${new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(shared)} catalog tags with ${seed.title}.`);
    if (shared.length && seed.genreContext?.level === "artist") reasons[0] = `Tagged ${shared.join(", ")} in MusicBrainz, matching ${seed.artist}’s artist-level genre profile. This is not a verified sound match for ${seed.title}.`;
    if (shared.length && item.genreContext?.level === "artist") reasons[0] = `${item.artist} and ${seed.artist} have ${shared.join(", ")} genre context in MusicBrainz. This pick uses artist metadata, not a verified sound match between these songs.`;
    if (gap !== null && selectedWeights.era > 0) reasons.push(`Catalog release year: ${itemYear}, ${gap === 0 ? "the same year as" : `${gap} year${gap === 1 ? "" : "s"} from`} your starting track (${seedYear}).`);
    if (options.unfamiliarArtists) reasons.push("This artist is not in your current bookmarks.");
    const evidence = { genres: shared, genreResearch: seed.genreResearch?.entries.filter((entry) => shared.includes(entry.name)), seedGenreContext: seed.genreContext || { level: "recording" }, candidateGenreContext: item.genreContext || { level: "recording" }, seedYear, candidateYear: itemYear, source: item.source || "Liner Notes", url: item.musicBrainzId ? `https://musicbrainz.org/recording/${item.musicBrainzId}` : item.appleMusicUrl || null };
    pool.push({ ...item, reasons, evidence, score: Number(score.toFixed(4)), components: { genre: Number(genreScore.toFixed(4)), era: Number(eraScore.toFixed(4)) } });
  }
  pool.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  const selected = [];
  while (pool.length && selected.length < (options.limit || 5)) {
    let bestIndex = 0, bestValue = -Infinity;
    for (let index = 0; index < pool.length; index++) {
      const candidate = pool[index];
      const redundancy = selected.length ? Math.max(...selected.map((item) =>
        Math.max(normalize(item.artist) === normalize(candidate.artist) ? 0.85 : 0,
          item.album && candidate.album && normalize(item.album) !== "release unknown" && normalize(item.album) === normalize(candidate.album) ? 0.8 : 0)
          + 0.15 * jaccard(genresOf(item), genresOf(candidate))
      )) : 0;
      const value = 0.75 * candidate.score - 0.25 * redundancy;
      if (value > bestValue) { bestIndex = index; bestValue = value; }
    }
    selected.push(pool.splice(bestIndex, 1)[0]);
  }
  return selected;
}

export async function retrieveCandidates(seed, options, dependencies = {}) {
  const search = dependencies.search || searchMusicBrainz;
  const local = dependencies.local || catalogSummaries();
  const seedGenres = discoveryGenres(seed).slice(0, 3);
  if (options.focus !== "era" && !seedGenres.length) return { candidates: [], providerStatus: seed.genreResearch?.status === "unavailable" ? "unavailable" : "insufficient-metadata" };
  const queryParts = seedGenres.map((genre) => `tag:${quote(genre)}`);
  if (!options.differentArtists) queryParts.push(`artist:${quote(seed.artist)}`);
  if (!queryParts.length && options.focus === "era" && yearOf(seed)) queryParts.push(`firstreleasedate:[${yearOf(seed) - 3} TO ${yearOf(seed) + 3}]`);
  if (!queryParts.length) return { candidates: local, providerStatus: "insufficient-metadata" };
  let query = `(${queryParts.join(" OR ")}) AND status:official`;
  if (options.differentArtists) query += ` AND NOT artist:${quote(seed.artist)}`;
  try {
    const remote = await search(query, 100);
    const related = [];
    // Artist tags cover catalogs whose individual recordings are not tagged yet.
    const findArtists = dependencies.findArtists || (!dependencies.search ? searchMusicBrainzArtists : null);
    if (findArtists && seedGenres.length) {
      try {
        const artists = await findArtists(queryParts.filter((part) => part.startsWith("tag:")).join(" OR "), 10);
        for (const artist of artists.filter((artist) => overlap(seedGenres, supportedGenres(artist)).length && (!options.differentArtists || normalize(artist.name) !== normalize(seed.artist))).slice(0, 4)) {
          try {
            const tracks = await search(`arid:${quote(artist.id)} AND status:official`, 20);
            for (const track of tracks.results) {
              if (normalize(track.artist) !== normalize(artist.name)) continue;
              const own = genresOf(track);
              // Never overwrite a conflicting recording-level subgenre.
              const selectedCounts = seed.genreResearch.entries.filter((entry) => seedGenres.includes(entry.name)).map((entry) => entry.recordingCount);
              const broaderOnly = own.every((name) => seed.genreResearch.entries.some((entry) => entry.name === name && entry.recordingCount > Math.max(...selectedCounts) * 4));
              if (own.length && !overlap(seedGenres, own).length && !broaderOnly) continue;
              related.push({ ...track, genres: [...new Set([...genresOf(track), ...overlap(genresOf(artist), genresOf(seed))])], genreContext: { level: "artist", name: artist.name, url: `https://musicbrainz.org/artist/${artist.id}` } });
            }
          } catch { /* A missing artist catalog must not discard other candidates. */ }
        }
      } catch { /* Recording-tag retrieval remains usable. */ }
    }
    return { candidates: [...local, ...remote.results, ...related], providerStatus: "ok" };
  } catch {
    return { candidates: local, providerStatus: "unavailable" };
  }
}

async function enrichPreview(item) {
  if (item.previewUrl && item.artworkUrl) return item;
  try {
    const payload = await searchAppleMusic(`${item.title} ${item.artist}`, 5);
    // Never attach a cover artist's audio just because it was the first result.
    const match = payload.results.find((candidate) => normalize(candidate.title) === normalize(item.title) && normalize(candidate.artist) === normalize(item.artist));
    if (!match) return item;
    return { ...item, artworkUrl: match.artworkUrl, thumbnailUrl: match.thumbnailUrl, previewUrl: match.previewUrl, appleMusicUrl: match.appleMusicUrl };
  } catch { return item; }
}

export async function discover(rawOptions, dependencies = {}) {
  const options = discoveryRequestSchema.parse(rawOptions);
  const seed = await (dependencies.resolveSeed || resolveSeed)(options.seedSlug);
  const load = () => retrieveCandidates(seed, options, dependencies);
  const retrieval = dependencies.search ? await load() : await cached(`discovery:v3:${seed.slug}:${discoveryGenres(seed).join(",")}:${options.differentArtists}:${options.focus === "era"}`, load, { ttlSeconds: 300 });
  const ranked = rankCandidates(seed, retrieval.candidates, options);
  const items = await Promise.all(ranked.map(dependencies.enrich || enrichPreview));
  return {
    seed, items, providerStatus: retrieval.providerStatus,
    method: "catalog-research-mmr-v3", weights: weights[options.focus],
    candidateCount: retrieval.candidates.length,
    limitations: ["Matches use catalog tags and release dates, not audio similarity.", "Catalog dates can refer to reissues; they are not verified recording dates.", ...(retrieval.providerStatus === "unavailable" ? ["MusicBrainz is unavailable; only the local catalog was searched."] : []), ...(items.length < options.limit ? ["There are fewer matching recordings than requested. Try another focus or allow the same artist."] : [])]
  };
}
