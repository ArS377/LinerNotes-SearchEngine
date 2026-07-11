import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { api, askAgent, getRecommendations, searchMusic } from "./api.js";
import type { RecordingSummary } from "../src/contracts/api.js";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } } });
const profileKey = "liner-notes-profile-v1";
const legacySavedKey = "liner-notes-saved-v2";

type Profile = { bookmarks: RecordingSummary[]; recentQueries: string[]; compare: RecordingSummary[] };
type SearchIntent = { type: "artist" | "track" | "lyrics" | "mixed"; confidence: number; entities: { artist?: string } };
type SongDetail = Record<string, unknown> & {
  title: string; artist: string | { name: string; summary?: string; wikipediaUrl?: string; officialUrl?: string };
  artworkUrl?: string; story?: string; album?: string; releaseDate?: string; duration?: string;
  version?: string; genres?: string[]; credits?: Array<[string, string]>; sources?: string[];
  lyrics?: { status?: string; message?: string; searchUrl?: string; artistUrl?: string };
  related?: Array<{ slug: string; title: string; version?: string; releaseDate?: string }>;
  appleMusicUrl?: string; spotifyUrl?: string; spotifySearchUrl?: string; musicBrainzUrl?: string;
};

function navigate(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new CustomEvent("liner-route"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function usePath() {
  const [path, setPath] = useState(`${location.pathname}${location.search}`);
  useEffect(() => {
    const update = () => setPath(`${location.pathname}${location.search}`);
    window.addEventListener("popstate", update);
    window.addEventListener("liner-route", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("liner-route", update); };
  }, []);
  return path;
}

function readProfile(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(profileKey) || "null");
    if (saved?.bookmarks) return { bookmarks: saved.bookmarks, recentQueries: saved.recentQueries || [], compare: saved.compare || [] };
    const legacy = JSON.parse(localStorage.getItem(legacySavedKey) || "[]");
    return { bookmarks: legacy, recentQueries: [], compare: [] };
  } catch { return { bookmarks: [], recentQueries: [], compare: [] }; }
}

function useProfile() {
  const [profile, setProfile] = useState<Profile>(readProfile);
  const update = (next: Profile) => { setProfile(next); localStorage.setItem(profileKey, JSON.stringify(next)); };
  const toggleBookmark = (recording: RecordingSummary) => update({ ...profile, bookmarks: profile.bookmarks.some((item) => item.slug === recording.slug) ? profile.bookmarks.filter((item) => item.slug !== recording.slug) : [recording, ...profile.bookmarks] });
  const toggleCompare = (recording: RecordingSummary) => {
    const exists = profile.compare.some((item) => item.slug === recording.slug);
    update({ ...profile, compare: exists ? profile.compare.filter((item) => item.slug !== recording.slug) : profile.compare.length < 3 ? [...profile.compare, recording] : [...profile.compare.slice(1), recording] });
  };
  const recordSearch = (query: string) => update({ ...profile, recentQueries: [query, ...profile.recentQueries.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 50) });
  return { profile, toggleBookmark, toggleCompare, recordSearch };
}

function artistPath(recording: RecordingSummary) {
  const value = String(recording.artistSlug || recording.artistMusicBrainzId || recording.artistAppleId || "");
  if (!value) return null;
  if (value.startsWith("mbid-")) return `/artists/mbid/${value.slice(5)}`;
  if (value.startsWith("apple-")) return `/artists/apple/${value.slice(6)}`;
  if (recording.artistMusicBrainzId) return `/artists/mbid/${recording.artistMusicBrainzId}`;
  if (recording.artistAppleId) return `/artists/apple/${recording.artistAppleId}`;
  return `/artists/local/${value}`;
}

function SearchBox({ initial = "", compact = false, onSearch }: { initial?: string; compact?: boolean; onSearch?: (query: string) => void }) {
  const [query, setQuery] = useState(initial);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    onSearch?.(query.trim());
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }
  return <form className={`search-form${compact ? " search-form--compact" : ""}`} role="search" onSubmit={submit}><label htmlFor={compact ? "compact-query" : "music-query"}>Search music</label><div className="search-form__field"><input id={compact ? "compact-query" : "music-query"} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Song, artist, or remembered lyric" /><button type="submit" aria-label="Search"><span>Search</span><span aria-hidden="true">↗</span></button></div></form>;
}

function ResultCard({ recording, bookmarked, comparing, onBookmark, onCompare }: { recording: RecordingSummary; bookmarked: boolean; comparing: boolean; onBookmark: () => void; onCompare: () => void }) {
  const artwork = recording.thumbnailUrl || recording.artworkUrl;
  const artistUrl = artistPath(recording);
  return <article className="result-card"><button className="result-card__main" onClick={() => navigate(`/songs/${encodeURIComponent(recording.slug)}`)}><span className={`result-art${artwork ? " has-artwork" : ""}`} style={artwork ? { backgroundImage: `url(${artwork})` } : undefined} aria-hidden="true" /><span className="result-card__copy"><span className="source-badge">{recording.source || recording.providers?.join(" · ") || "Liner Notes"}</span><strong>{recording.title}</strong><span>{recording.artist}</span></span></button><div className="result-actions">{artistUrl && <button onClick={() => navigate(artistUrl)}>Artist</button>}<button aria-pressed={comparing} onClick={onCompare}>{comparing ? "Comparing" : "Compare"}</button><button aria-pressed={bookmarked} onClick={onBookmark}>{bookmarked ? "Bookmarked" : "Bookmark"}</button></div>{recording.matchReason && <details className="result-reason"><summary>Why this result?</summary><p>{recording.matchReason}. Found through {(recording.providers || [recording.source || "Liner Notes"]).join(" and ")}.</p></details>}</article>;
}

function MusicBrief({ context, assistantEnabled }: { context: Record<string, unknown>; assistantEnabled: boolean }) {
  const [prompt, setPrompt] = useState("");
  const mutation = useMutation({ mutationFn: () => askAgent(prompt, context) });
  const results = Array.isArray(context.results) ? context.results as RecordingSummary[] : [];
  const sources = [...new Set(results.flatMap((item) => item.providers || [item.source || "Liner Notes"]))];
  return <section className="assistant-panel"><div className="assistant-panel__heading"><span className="eyebrow">Music brief</span><h2>{results.length ? `${results.length} recordings across ${sources.length || 1} sources` : "Grounded song context"}</h2><p>{results.length ? `Sources in this view: ${sources.join(" · ")}. Compare versions or open a song for credits and provenance.` : "Credits, release metadata, and source links are collected below."}</p></div>{assistantEnabled && <div className="assistant-panel__body"><form className="assistant-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><label htmlFor="agent-prompt">Ask the music agent</label><textarea id="agent-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={2000} required placeholder="Compare versions or explain the context" /><button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Researching…" : "Ask"}</button></form><div className="assistant-response" aria-live="polite">{mutation.error && <p>{mutation.error.message}</p>}{mutation.data && <><p>{mutation.data.answer}</p><small>Confidence: {mutation.data.confidence}</small></>}</div></div>}</section>;
}

function Cards({ recordings, profile, toggleBookmark, toggleCompare }: { recordings: RecordingSummary[]; profile: Profile; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void }) {
  return <div className="results-list" data-results-list>{recordings.map((recording) => <ResultCard key={recording.slug} recording={recording} bookmarked={profile.bookmarks.some((item) => item.slug === recording.slug)} comparing={profile.compare.some((item) => item.slug === recording.slug)} onBookmark={() => toggleBookmark(recording)} onCompare={() => toggleCompare(recording)} />)}</div>;
}

function SearchResults({ url, profile, recordSearch, toggleBookmark, toggleCompare, assistantEnabled }: { url: URL; profile: Profile; recordSearch: (query: string) => void; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void; assistantEnabled: boolean }) {
  const query = url.searchParams.get("q") || "";
  const offset = Number(url.searchParams.get("offset") || 0);
  const genreFilter = url.searchParams.get("genre") || "all";
  const sourceFilter = url.searchParams.get("source") || "all";
  const local = useQuery({ queryKey: ["search", query, "local"], queryFn: () => searchMusic(query, 0, "local"), enabled: Boolean(query) });
  const remote = useQuery({ queryKey: ["search", query, offset, "federated"], queryFn: () => searchMusic(query, offset), enabled: Boolean(query) });
  useEffect(() => { if (query) recordSearch(query); }, [query]);
  const data = remote.data || local.data;
  const results = data?.results || [];
  const genres = [...new Set(results.flatMap((item) => Array.isArray(item.genres) ? item.genres as string[] : []))].sort();
  const sources = [...new Set(results.flatMap((item) => item.providers || [item.source || "Liner Notes"]))].sort();
  const filtered = results.filter((item) => (genreFilter === "all" || (item.genres as string[] | undefined)?.includes(genreFilter)) && (sourceFilter === "all" || (item.providers || [item.source]).includes(sourceFilter)));
  const setFilter = (name: string, value: string) => { const next = new URLSearchParams(url.searchParams); if (value === "all") next.delete(name); else next.set(name, value); next.delete("offset"); navigate(`/search?${next}`); };
  const intent = data?.intent as SearchIntent | undefined;
  return <section className="results-view"><div className="shell compact-search-wrap"><SearchBox initial={query} compact onSearch={recordSearch} /></div><div className="shell results-heading"><p className="eyebrow">Search results</p><h1>{query ? `“${query}”` : "Start a search"}</h1><p aria-live="polite">{remote.isPending ? local.data ? `Showing local matches while global catalogs respond…` : "Searching across providers…" : remote.error ? "Remote providers are unavailable; showing local matches." : `${filtered.length} ranked matches`}</p>{intent && <span className="intent-chip">Understood as {intent.type} · {Math.round(intent.confidence * 100)}% confidence</span>}</div>{results.length > 0 && <div className="shell filter-bar"><label>Genre<select value={genreFilter} onChange={(event) => setFilter("genre", event.target.value)}><option value="all">All genres</option>{genres.map((genre) => <option key={genre}>{genre}</option>)}</select></label><label>Source<select value={sourceFilter} onChange={(event) => setFilter("source", event.target.value)}><option value="all">All sources</option>{sources.map((source) => <option key={source}>{source}</option>)}</select></label><span>{data?.timings.totalMs.toFixed(0)} ms</span></div>}<div className="shell">{(local.isPending && remote.isPending) && <State title="Looking through the catalog" body="Matching titles, artists, and remembered lyrics." />}{data && filtered.length === 0 && <State title="No match in this view" body="Clear the filters or try a shorter title, artist, or lyric fragment." />}<Cards recordings={filtered} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />{remote.data?.hasMore && <button className="load-more" onClick={() => { const next = new URLSearchParams(url.searchParams); next.set("offset", String(offset + 20)); navigate(`/search?${next}`); }}>Load the next page</button>}<MusicBrief context={{ type: "search", query, results: filtered.slice(0, 8) }} assistantEnabled={assistantEnabled} /></div></section>;
}

function State({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) { return <div className="state-message"><strong>{title}</strong><p>{body}</p>{action}</div>; }

function Home({ recordSearch }: { recordSearch: (query: string) => void }) {
  const discovery = useQuery({ queryKey: ["discover"], queryFn: () => api<{ featured: RecordingSummary[]; genres: Array<{ name: string; slug: string; color?: string }> }>("/api/discover") });
  return <section className="hero"><div className="shell hero__grid"><div className="hero-copy"><p className="eyebrow">A search engine for music</p><h1>Find the song.<br /><em>Follow the thread.</em></h1><p>Search by title, artist, or remembered lyric. Then trace versions, credits, context, and sources.</p></div><SearchBox onSearch={recordSearch} /><div className="search-help"><p className="eyebrow">Search by what you remember</p><ul><li>“we were born before the wind”</li><li>“Taylor Swift”</li><li>“live versions of Jolene”</li></ul></div><div className="catalog-strip"><p>Explore across genres</p><div>{discovery.data?.genres.slice(0, 6).map((genre) => <button key={genre.slug} onClick={() => navigate(`/genres/${genre.slug}`)}>{genre.name}</button>)}</div></div></div></section>;
}

function Explore({ profile, toggleBookmark, toggleCompare }: { profile: Profile; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void }) {
  const discovery = useQuery({ queryKey: ["discover"], queryFn: () => api<{ featured: RecordingSummary[]; genres: Array<{ name: string; slug: string; color?: string; count?: number }> }>("/api/discover") });
  return <section className="shell page-view"><p className="eyebrow">Explore the catalog</p><h1>Start with a thread.</h1><p className="page-intro">Move through genre, era, artist, and version instead of waiting for an algorithm to guess.</p><div className="genre-index">{discovery.data?.genres.map((genre) => <button key={genre.slug} onClick={() => navigate(`/genres/${genre.slug}`)}><strong>{genre.name}</strong><span>{genre.count ? `${genre.count} recordings` : "Open genre"} ↗</span></button>)}</div><section className="section-block"><p className="eyebrow">Landmark recordings</p><Cards recordings={discovery.data?.featured || []} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} /></section></section>;
}

function GenrePage({ slug, profile, toggleBookmark, toggleCompare }: { slug: string; profile: Profile; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void }) {
  const genre = useQuery({ queryKey: ["genre", slug], queryFn: () => api<{ name: string; description?: string; recordings: RecordingSummary[] }>(`/api/genres/${encodeURIComponent(slug)}`) });
  if (genre.isPending) return <StatePage text="Opening the genre…" />;
  if (!genre.data) return <StatePage text="Genre unavailable" />;
  return <section className="shell page-view"><button className="text-link" onClick={() => navigate("/explore")}>← Explore</button><p className="eyebrow">Genre</p><h1>{genre.data.name}</h1><p className="page-intro">{genre.data.description || `Recordings associated with ${genre.data.name}.`}</p><Cards recordings={genre.data.recordings || []} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} /></section>;
}

function ArtistPage({ source, id, profile, toggleBookmark, toggleCompare }: { source: string; id: string; profile: Profile; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void }) {
  const endpoint = source === "local" ? `/api/artists/${id}` : source === "apple" ? `/api/apple-artists/${id}` : `/api/external-artists/${id}`;
  const artist = useQuery({ queryKey: ["artist", source, id], queryFn: () => api<Record<string, unknown> & { name: string; summary?: string; country?: string; genres?: string[]; recordings?: RecordingSummary[]; imageUrl?: string; wikipediaUrl?: string; officialUrl?: string }>(endpoint) });
  if (artist.isPending) return <StatePage text="Opening the artist profile…" />;
  if (!artist.data) return <StatePage text="Artist unavailable" />;
  return <section className="shell page-view artist-view"><div><p className="eyebrow">Artist profile</p><h1>{artist.data.name}</h1><p className="page-intro">{artist.data.summary || "Artist context from the connected music catalogs."}</p><div className="meta-line">{[artist.data.country, ...(artist.data.genres || []).slice(0, 4)].filter(Boolean).join(" · ")}</div><div className="external-links">{artist.data.officialUrl && <a href={artist.data.officialUrl} target="_blank" rel="noreferrer">Official site ↗</a>}{artist.data.wikipediaUrl && <a href={artist.data.wikipediaUrl} target="_blank" rel="noreferrer">Wikipedia ↗</a>}</div></div>{artist.data.imageUrl && <img src={artist.data.imageUrl} alt="" />}<section className="section-block artist-discography"><p className="eyebrow">Discography</p><Cards recordings={artist.data.recordings || []} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} /></section></section>;
}

function Song({ slug, assistantEnabled, toggleCompare }: { slug: string; assistantEnabled: boolean; toggleCompare: (item: RecordingSummary) => void }) {
  const endpoint = slug.startsWith("mbid-") ? `/api/external-songs/${encodeURIComponent(slug.slice(5))}` : slug.startsWith("apple-") ? `/api/apple-songs/${encodeURIComponent(slug.slice(6))}` : `/api/songs/${encodeURIComponent(slug)}`;
  const song = useQuery({ queryKey: ["song", slug], queryFn: () => api<SongDetail>(endpoint) });
  if (song.isPending) return <StatePage text="Opening the liner notes…" />;
  if (!song.data) return <StatePage text="Recording unavailable" />;
  const data = song.data; const artist = typeof data.artist === "string" ? data.artist : data.artist.name;
  const summary = { slug, title: data.title, artist, artworkUrl: data.artworkUrl, genres: data.genres, releaseDate: data.releaseDate, version: data.version } as RecordingSummary;
  const release = [data.album, data.releaseDate, data.duration].filter(Boolean).join(" · ");
  const lyricUrl = data.lyrics?.searchUrl || data.lyrics?.artistUrl;
  return <article className="song-view"><div className="shell"><button className="text-link" onClick={() => history.back()}>← Back to results</button><div className="song-hero"><div><p className="eyebrow">Liner notes</p><h1>{data.title}</h1><p className="song-artist">{artist}</p>{release && <p className="song-release">{release}</p>}<button className="compare-primary" onClick={() => { toggleCompare(summary); navigate("/compare"); }}>Compare this version</button></div>{data.artworkUrl && <img src={data.artworkUrl} alt="" />}</div><div className="song-details">{data.story && <section className="story-section"><p className="eyebrow">About the song</p><p>{data.story}</p></section>}<section className="song-info"><div><p className="eyebrow">Recording details</p><p className="genre-listing">{(data.genres || []).join(" · ") || "Genre unavailable"}</p></div>{data.credits?.length && <dl>{data.credits.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>}</section><section className="lyrics-section"><p className="eyebrow">Lyrics</p><p>{data.lyrics?.message || "Lyrics are not reproduced here."}</p>{lyricUrl && <a href={lyricUrl} target="_blank" rel="noreferrer">Open an authorized lyrics source ↗</a>}</section><section className="sources-section"><p className="eyebrow">Sources</p><p>{(data.sources || []).join(" · ") || "Source details unavailable"}</p><div className="external-links">{data.musicBrainzUrl && <a href={data.musicBrainzUrl}>MusicBrainz ↗</a>}{data.appleMusicUrl && <a href={data.appleMusicUrl}>Apple Music ↗</a>}{(data.spotifyUrl || data.spotifySearchUrl) && <a href={data.spotifyUrl || data.spotifySearchUrl}>Spotify search ↗</a>}</div></section></div><MusicBrief context={{ type: "song", song: data }} assistantEnabled={assistantEnabled} /></div></article>;
}

function Compare({ items, toggleCompare }: { items: RecordingSummary[]; toggleCompare: (item: RecordingSummary) => void }) {
  return <section className="shell page-view"><p className="eyebrow">Version desk</p><h1>Compare recordings.</h1><p className="page-intro">Line up originals, rerecordings, live takes, and covers. Metadata only; no audio is stored.</p>{items.length < 2 && <State title="Choose at least two recordings" body="Use Compare on any search result. Your comparison tray holds up to three versions." action={<button className="text-link" onClick={() => navigate("/")}>Find recordings →</button>} />}<div className="compare-grid">{items.map((item) => <article key={item.slug}><button className="remove-compare" onClick={() => toggleCompare(item)}>Remove</button><div className={`compare-art${item.artworkUrl || item.thumbnailUrl ? " has-artwork" : ""}`} style={item.artworkUrl || item.thumbnailUrl ? { backgroundImage: `url(${item.artworkUrl || item.thumbnailUrl})` } : undefined} /><span className="source-badge">{item.source || "Liner Notes"}</span><h2>{item.title}</h2><p>{item.artist}</p><dl><dt>Version</dt><dd>{String(item.version || "Recording")}</dd><dt>Released</dt><dd>{String(item.releaseDate || "Unknown")}</dd><dt>Genres</dt><dd>{Array.isArray(item.genres) ? (item.genres as string[]).join(", ") : "Unknown"}</dd></dl><button className="text-link" onClick={() => navigate(`/songs/${item.slug}`)}>Open liner notes →</button></article>)}</div>{items.length >= 2 && <section className="comparison-summary"><p className="eyebrow">What changed?</p><p>{comparisonCopy(items)}</p></section>}</section>;
}

function comparisonCopy(items: RecordingSummary[]) {
  const artists = [...new Set(items.map((item) => item.artist))]; const years = items.map((item) => String(item.releaseDate || "").slice(0, 4)).filter(Boolean);
  return `${items.length} recordings${artists.length > 1 ? ` by ${artists.join(", ")}` : ` by ${artists[0]}`}. ${years.length > 1 ? `Their release dates span ${years.sort()[0]} to ${years.sort().at(-1)}.` : "Release dates are limited."} Compare the credited version, source, and genre notes above before opening the full liner notes.`;
}

function Insights({ profile }: { profile: Profile }) {
  const insights = useQuery({ queryKey: ["insights", profile.bookmarks, profile.recentQueries], queryFn: () => getRecommendations(profile.bookmarks, profile.recentQueries) });
  const data = insights.data;
  return <section className="shell page-view insights-view"><p className="eyebrow">Private music intelligence</p><h1>Your listening map.</h1><p className="page-intro">Calculated from metadata you bookmarked and searched for. It stays in this browser and is never sold or used for ad targeting.</p>{data && <><div className="insight-hero"><TasteConstellation genres={data.profile.topGenres} decades={data.profile.decades} /><div className="metric-ledger"><div><strong>{data.profile.diversityScore}</strong><span>Diversity score</span></div><div><strong>{data.profile.uniqueArtists}</strong><span>Artists</span></div><div><strong>{data.profile.uniqueGenres}</strong><span>Genres</span></div><div><strong>{data.profile.searchCount}</strong><span>Recent searches</span></div></div></div><div className="insight-columns"><section><p className="eyebrow">Top genres</p>{data.profile.topGenres.length ? data.profile.topGenres.map((item) => <div className="bar-row" key={item.name}><span>{item.name}</span><i style={{ width: `${Math.min(100, item.count / Math.max(1, data.profile.bookmarkCount) * 100)}%` }} /></div>) : <p>Bookmark a few recordings to shape this profile.</p>}</section><section><p className="eyebrow">Top artists</p>{data.profile.topArtists.length ? <ol>{data.profile.topArtists.map((item) => <li key={item.name}>{item.name}<span>{item.count}</span></li>)}</ol> : <p>No artist pattern yet.</p>}</section></div><section className="section-block"><p className="eyebrow">Explainable recommendations</p><div className="recommendation-grid">{data.recommendations.map((item) => <article key={item.slug}><span className="source-badge">{item.source || "Liner Notes"}</span><h2>{item.title}</h2><p>{item.artist}</p><small>{item.reason}</small><button onClick={() => navigate(`/songs/${item.slug}`)}>Open ↗</button></article>)}</div></section></>}</section>;
}

function TasteConstellation({ genres, decades }: { genres: Array<{ name: string; count: number }>; decades: Array<{ name: string; count: number }> }) { const labels = [...genres.slice(0, 4), ...decades.slice(0, 2)]; return <div className="taste-constellation" aria-label={`Taste map: ${labels.map((item) => item.name).join(", ") || "not enough data"}`}><span className="constellation-core">YOU</span>{labels.map((item, index) => <span key={item.name} style={{ "--angle": `${index * (360 / Math.max(1, labels.length))}deg`, "--distance": `${80 + item.count * 8}px` } as React.CSSProperties}>{item.name}</span>)}</div>; }

function Bookmarks({ profile, toggleBookmark, toggleCompare }: { profile: Profile; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void }) { return <section className="shell page-view"><p className="eyebrow">Metadata bookmarks</p><h1>Bookmarks.</h1><p className="page-intro">This list stores titles and catalog metadata only. It never downloads audio or lyric text.</p>{profile.bookmarks.length ? <Cards recordings={profile.bookmarks} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} /> : <State title="Nothing bookmarked yet" body="Bookmark a search result to build your private listening map." action={<button className="text-link" onClick={() => navigate("/")}>Search the catalog →</button>} />}</section>; }

function About() { return <section className="shell page-view about-view"><p className="eyebrow">How Liner Notes works</p><h1>Search with receipts.</h1><p className="page-intro">An independent music search engine that explains where every fact came from.</p><div className="architecture-flow"><span>Query intent</span><b>→</b><span>Local catalog</span><b>+</b><span>MusicBrainz</span><b>+</b><span>Apple Music</span><b>→</b><span>Ranked, cited results</span></div><div className="principle-grid"><section><h2>Federated search</h2><p>Results are normalized, deduplicated, and ranked across open and commercial catalogs.</p></section><section><h2>Explainable intelligence</h2><p>Recommendations use content features and show their reasons. No paid model is required.</p></section><section><h2>Legal by design</h2><p>No audio files or full lyric text are stored. Playback and lyric destinations stay with authorized sources.</p></section><section><h2>Resilient providers</h2><p>Local search continues when optional services fail, with provider status visible in the interface.</p></section></div></section>; }

function StatePage({ text }: { text: string }) { return <div className="shell state-page">{text}</div>; }

function App() {
  const path = usePath(); const url = useMemo(() => new URL(path, location.origin), [path]);
  const { profile, toggleBookmark, toggleCompare, recordSearch } = useProfile();
  const capabilities = useQuery({ queryKey: ["capabilities"], queryFn: () => api<{ openClawAssistant: boolean }>("/api/capabilities") });
  const assistantEnabled = capabilities.data?.openClawAssistant === true;
  const parts = url.pathname.split("/").filter(Boolean);
  let content: React.ReactNode = <Home recordSearch={recordSearch} />;
  if (url.pathname === "/search") content = <SearchResults url={url} profile={profile} recordSearch={recordSearch} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} assistantEnabled={assistantEnabled} />;
  else if (url.pathname === "/explore") content = <Explore profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />;
  else if (parts[0] === "genres" && parts[1]) content = <GenrePage slug={parts[1]} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />;
  else if (parts[0] === "artists" && parts[1] && parts[2]) content = <ArtistPage source={parts[1]} id={parts[2]} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />;
  else if (parts[0] === "songs" && parts[1]) content = <Song slug={decodeURIComponent(parts.slice(1).join("/"))} assistantEnabled={assistantEnabled} toggleCompare={toggleCompare} />;
  else if (url.pathname === "/compare") content = <Compare items={profile.compare} toggleCompare={toggleCompare} />;
  else if (url.pathname === "/insights") content = <Insights profile={profile} />;
  else if (url.pathname === "/bookmarks" || url.pathname === "/saved") content = <Bookmarks profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />;
  else if (url.pathname === "/about") content = <About />;
  const nav = [{ path: "/", label: "Search" }, { path: "/explore", label: "Explore" }, { path: "/insights", label: "Insights" }, { path: "/bookmarks", label: `Bookmarks ${profile.bookmarks.length}` }, { path: "/compare", label: `Compare ${profile.compare.length}` }];
  return <><header className="site-header"><div className="shell site-header__inner"><button className="wordmark" onClick={() => navigate("/")}>LINER NOTES</button><nav aria-label="Primary navigation">{nav.map((item) => <button key={item.path} aria-current={url.pathname === item.path ? "page" : undefined} onClick={() => navigate(item.path)}>{item.label}</button>)}</nav></div></header><main id="app" tabIndex={-1}>{content}</main><footer><div className="shell"><p>Built for curious listeners.</p><button onClick={() => navigate("/about")}>How it works</button></div></footer></>;
}

type WindowWithRoot = Window & { linerNotesRoot?: ReturnType<typeof createRoot> };
const appWindow = window as WindowWithRoot;
const root = appWindow.linerNotesRoot || createRoot(document.getElementById("root")!);
appWindow.linerNotesRoot = root;
root.render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
