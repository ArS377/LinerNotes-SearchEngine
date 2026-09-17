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
  // Bound provider work and cover different artists before revisiting an artist.
  const unique = [...new Map(options.bookmarks.map((item) => [item.slug, item])).values()];
  const artists = new Set();
  const first = [], remaining = [];
  for (const item of unique) {
    const artist = normalize(item.artist);
    (artists.has(artist) ? remaining : first).push(item);
    artists.add(artist);
  }
  const seeds = [...first, ...remaining].slice(0, 4);
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
      groups.push(found.items.filter((item) => item.evidence?.genres?.length && item.components?.genre > 0));
    } catch {
      incomplete = true;
      groups.push([]);
    }
  }
  const slugs = new Set(unique.map((item) => item.slug));
  const identities = new Set(unique.map(identity));
  const artistCounts = new Map(), albums = new Set();
  // Round-robin keeps one bookmarked style from consuming the whole list.
  for (let index = 0; index < 10 && result.recommendations.length < options.limit; index++) {
    for (const group of groups) {
      const item = group[index];
      if (!item || result.recommendations.length >= options.limit) continue;
      const key = identity(item), artist = normalize(item.artist);
      const album = item.album && normalize(item.album) !== "release unknown" ? `${artist}::${normalize(item.album)}` : null;
      if (slugs.has(item.slug) || identities.has(key) || (artistCounts.get(artist) || 0) >= 2 || (album && albums.has(album))) continue;
      slugs.add(item.slug); identities.add(key);
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
      if (album) albums.add(album);
      result.recommendations.push({ ...item, reason: item.reasons.join(" "), recommendationScore: item.score });
    }
  }
  return { ...result, status: incomplete ? "partial" : result.recommendations.length ? "ok" : "empty", seedsChecked: seeds.length, totalSeeds: unique.length };
}
