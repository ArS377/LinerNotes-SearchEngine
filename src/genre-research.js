import { listMusicBrainzGenres, searchMusicBrainz } from "./providers/musicbrainz.js";
import { cached } from "./services/cache.js";

// Preserve non-Latin names; only spelling punctuation/case is normalized.
export const normalizeGenre = (value) => String(value).normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const genreNames = (item) => [...new Set((item.genres || []).filter((name) => typeof name === "string").map(normalizeGenre).filter(Boolean))];
export function supportedGenres(item) {
  const votes = new Map(Object.entries(item.genreVotes || {}).map(([name, count]) => [normalizeGenre(name), count]));
  const max = Math.max(0, ...votes.values());
  return genreNames(item).filter((name) => !max || (votes.get(name) || 0) >= Math.max(1, max / 3));
}
export const quoteGenre = (value) => `"${String(value).replace(/[\\"]/g, " ").slice(0, 150)}"`;

export async function researchGenres(recording, artist = null, dependencies = {}) {
  const getCatalog = dependencies.catalog || (() => cached("genre-catalog:v1", listMusicBrainzGenres, { ttlSeconds: 86400, staleSeconds: 604800 }));
  const count = dependencies.count || ((name) => cached(`genre-count:v1:${name}`, async () => {
    const result = await searchMusicBrainz(`tag:${quoteGenre(name)} AND status:official`, 1);
    if (!Number.isFinite(result.total) || result.total < 0) throw new Error("Missing genre prevalence");
    return result.total;
  }, { ttlSeconds: 86400, staleSeconds: 604800 }));
  const base = { source: "MusicBrainz", catalogUrl: "https://musicbrainz.org/genres", researchedAt: new Date().toISOString(), entries: [], selected: [], status: "unavailable" };
  let catalog;
  try { catalog = new Map((await getCatalog()).map((name) => [normalizeGenre(name), name])); }
  catch { return base; }
  const trackNames = supportedGenres(recording).filter((name) => catalog.has(name));
  const artistNames = supportedGenres(artist || {}).filter((name) => catalog.has(name));
  const supportOf = (item, name) => {
    const votes = new Map(Object.entries(item.genreVotes || {}).map(([label, value]) => [normalizeGenre(label), value]));
    const max = Math.max(0, ...votes.values());
    return max ? (votes.get(name) || 0) / max : 1;
  };
  const names = [...new Set([...trackNames, ...artistNames])].slice(0, 12);
  const entries = [];
  let failed = 0;
  for (const name of names) {
    try {
      const recordingCount = await count(catalog.get(name));
      if (!Number.isFinite(recordingCount) || recordingCount < 0) throw new Error("Invalid prevalence");
      const level = trackNames.includes(name) ? "recording" : "artist";
      entries.push({ name, catalogName: catalog.get(name), recordingCount, support: supportOf(level === "recording" ? recording : artist, name), level, url: `https://musicbrainz.org/search?query=${encodeURIComponent(`tag:${quoteGenre(catalog.get(name))} AND status:official`)}&type=recording&method=advanced` });
    } catch { failed++; }
  }
  const supported = entries.filter((entry) => entry.recordingCount > 0);
  const largest = Math.max(0, ...supported.map((entry) => entry.recordingCount));
  for (const entry of supported) entry.specificityScore = entry.support * Math.max(0.1, Math.log((largest + 1) / (entry.recordingCount + 1)));
  // Rarity is a corpus signal, not a hand-authored hierarchy or a sound claim.
  // Keep recording-level evidence when it is comparably specific to artist tags.
  const strongest = Math.max(0, ...supported.map((entry) => entry.specificityScore));
  const narrow = supported.filter((entry) => entry.specificityScore >= strongest / 2);
  const tracks = narrow.filter((entry) => entry.level === "recording");
  const selected = failed ? [] : (tracks.length ? tracks : narrow).sort((a, b) => b.specificityScore - a.specificityScore || a.name.localeCompare(b.name)).slice(0, 3).map((entry) => entry.name);
  return { ...base, catalogSize: catalog.size, entries, selected, status: failed ? "partial" : supported.length ? "ok" : "insufficient-metadata" };
}
