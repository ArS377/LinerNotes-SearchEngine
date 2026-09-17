import { z } from "zod";
import { discover } from "./discovery.js";
import { slugSchema } from "./contracts/discovery.js";
import { buildMusicInsights } from "./music-intelligence.js";
import { normalize } from "./search.js";

const requestSchema = z.object({
  bookmarks: z.array(z.object({
    slug: slugSchema, title: z.string().min(1).max(500), artist: z.string().min(1).max(500),
    genres: z.array(z.string().max(200)).max(100).optional(),
    releaseDate: z.string().max(100).nullable().optional()
  })).max(200).default([]),
  recentQueries: z.array(z.string().max(200)).max(50).default([]),
  limit: z.number().int().min(1).max(24).default(12)
});
const identity = (item) => `${normalize(item.artist)}::${normalize(item.title)}`;

export async function bookmarkDiscovery(input, dependencies = {}) {
  const options = requestSchema.parse(input);
  const result = buildMusicInsights(options);
  // Every saved recording participates; concurrency, not library coverage, is bounded.
  const unique = [...new Map(options.bookmarks.map((item) => [item.slug, item])).values()];
  const artists = new Set();
  const first = [], remaining = [];
  for (const item of unique) {
    const artist = normalize(item.artist);
    (artists.has(artist) ? remaining : first).push(item);
    artists.add(artist);
  }
  const seeds = [...first, ...remaining];
  const groups = [];
  let incomplete = false;
  // Sequential seed lookups avoid multiplying MusicBrainz's rate-limited queue.
  for (const seed of seeds) {
    try {
      const found = await (dependencies.discover || discover)({
        seedSlug: seed.slug, focus: "genre", differentArtists: true,
        excludeSlugs: unique.map((item) => item.slug), limit: Math.min(10, options.limit)
      });
      incomplete ||= found.providerStatus === "unavailable";
      groups.push({ seed, items: found.items.filter((item) => item.evidence?.genres?.length && item.components?.genre > 0) });
    } catch {
      incomplete = true;
      groups.push({ seed, items: [] });
    }
  }
  const slugs = new Set(unique.map((item) => item.slug));
  const identities = new Set(unique.map(identity));
  const pool = new Map();
  // Merge evidence BEFORE selection: deduplication must not erase other bookmarks.
  for (const { seed, items } of groups) {
    for (const item of items) {
      const key = identity(item);
      if (slugs.has(item.slug) || identities.has(key)) continue;
      if (!pool.has(key)) pool.set(key, { ...item, matchedBookmarks: [] });
      const entry = pool.get(key);
      if (!entry.matchedBookmarks.some((match) => match.slug === seed.slug)) {
        entry.matchedBookmarks.push({ slug: seed.slug, title: seed.title, artist: seed.artist, score: item.score, evidence: item.evidence, reasons: item.reasons });
      }
    }
  }
  const artistCounts = new Map(), albums = new Set(), coverage = new Map();
  while (pool.size && result.recommendations.length < options.limit) {
    let best = null, bestValue = -Infinity;
    for (const item of pool.values()) {
      const key = identity(item), artist = normalize(item.artist);
      const album = item.album && normalize(item.album) !== "release unknown" ? `${artist}::${normalize(item.album)}` : null;
      if ((artistCounts.get(artist) || 0) >= 2 || (album && albums.has(album))) continue;
      // Diminishing credit for represented seeds gives other saved styles a turn.
      const value = item.matchedBookmarks.reduce((sum, match) => sum + (1 + match.score) / (1 + (coverage.get(match.slug) || 0)) ** 2, 0);
      if (value > bestValue || (value === bestValue && key < identity(best))) { best = item; bestValue = value; }
    }
    if (!best) break;
    pool.delete(identity(best));
    const artist = normalize(best.artist);
    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    if (best.album && normalize(best.album) !== "release unknown") albums.add(`${artist}::${normalize(best.album)}`);
    for (const match of best.matchedBookmarks) coverage.set(match.slug, (coverage.get(match.slug) || 0) + 1);
    best.matchedBookmarks.sort((a, b) => a.slug.localeCompare(b.slug));
    const reason = best.matchedBookmarks.length === 1
      ? best.matchedBookmarks[0].reasons.join(" ")
      : `Matches your bookmarks: ${best.matchedBookmarks.map((match) => `${match.title} by ${match.artist} (${match.evidence.genres.join(", ")})`).join("; ")}. Uses catalog genre metadata, which may be artist- or album-level, not audio similarity.`;
    result.recommendations.push({ ...best, reason, recommendationScore: bestValue });
  }
  return { ...result, status: incomplete ? "partial" : result.recommendations.length ? "ok" : "empty", seedsChecked: seeds.length, totalSeeds: unique.length };
}
