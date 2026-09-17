import React, { FormEvent, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { api, askAgent, getRecommendations, searchMusic } from "./api.js";
import { ResearchAnswer } from "./ResearchAnswer.js";
import { Discovery, TrailLibrary } from "./Discovery.js";
import { Comparison } from "./Comparison.js";
import type { RecordingSummary } from "../src/contracts/api.js";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } } });
const profileKey = "liner-notes-profile-v1";
const legacySavedKey = "liner-notes-saved-v2";

type Media = { artworkUrl?: string | null; previewUrl?: string | null; appleMusicUrl?: string | null };
const PlayerContext = createContext<{ current: RecordingSummary | null; play: (item: RecordingSummary) => void }>({ current: null, play: () => {} });
function Icon({ name, size = 20 }: { name: "search" | "play" | "save" | "shuffle" | "close" | "arrow" | "record"; size?: number }) {
  const paths = { search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>, play: <path d="m8 5 11 7-11 7Z" />, save: <path d="M6 3h12v18l-6-4-6 4Z" />, shuffle: <><path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4" /></>, close: <path d="m6 6 12 12M6 18 18 6" />, arrow: <path d="M4 12h16m-6-6 6 6-6 6" />, record: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><path d="M5 12a7 7 0 0 1 7-7m7 7a7 7 0 0 1-7 7" /></> };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function useRecordingMedia(recording: RecordingSummary) {
  const local = !recording.external && !recording.slug.startsWith("apple-") && !recording.slug.startsWith("mbid-");
  const media = useQuery({ queryKey: ["playback", recording.slug], queryFn: () => api<Media>(`/api/playback/${encodeURIComponent(recording.slug)}`), enabled: local && (!recording.artworkUrl || !recording.previewUrl), staleTime: 600_000, retry: false });
  return { ...recording, artworkUrl: recording.artworkUrl || media.data?.artworkUrl, previewUrl: recording.previewUrl || media.data?.previewUrl, appleMusicUrl: recording.appleMusicUrl || media.data?.appleMusicUrl } as RecordingSummary;
}
function Artwork({ recording }: { recording: RecordingSummary }) {
  const [failed, setFailed] = useState(false);
  const url = recording.artworkUrl || recording.thumbnailUrl;
  return <span className="artwork">{url && !failed ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span className="artwork-fallback" style={{ backgroundColor: String(recording.color || "#554b55") }}><Icon name="record" size={52} /><span>{recording.artist}</span></span>}</span>;
}
function PreviewPlayer({ current, close }: { current: RecordingSummary | null; close: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState("");
  useEffect(() => { setError(""); if (current) audio.current?.play().catch(() => setError("Press play to start the preview.")); }, [current]);
  if (!current) return null;
  return <aside className="preview-player" aria-label="Music preview"><Artwork recording={current} /><div className="player-title"><strong>{current.title}</strong><span>{current.artist} · Preview</span>{error && <span role="status">{error}</span>}</div><audio ref={audio} src={current.previewUrl || undefined} controls autoPlay onError={() => setError("This preview is unavailable. Open the recording for listening links.")} /><button className="icon-button" aria-label="Close preview" onClick={close}><Icon name="close" /></button></aside>;
}

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
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
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
  return { profile, toggleBookmark, toggleCompare, recordSearch, clearRecentSearches: () => update({ ...profile, recentQueries: [] }) };
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
  const [mode, setMode] = useState("All music");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setQuery(initial), [initial]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) { event.preventDefault(); input.current?.focus(); } };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    const value = mode === "Lyrics" ? `"${query.trim().replace(/^"|"$/g, "")}"` : query.trim();
    onSearch?.(value);
    navigate(`/search?q=${encodeURIComponent(value)}`);
  }
  return <form className={`search-form${compact ? " search-form--compact" : ""}`} role="search" onSubmit={submit}>{!compact && <div className="search-modes" aria-label="Search by">{["All music", "Lyrics"].map((value) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => { setMode(value); input.current?.focus(); }}>{value}</button>)}</div>}<label className="sr-only" htmlFor={compact ? "compact-query" : "music-query"}>Search music</label><div className="search-form__field"><Icon name="search" size={24} /><input ref={input} id={compact ? "compact-query" : "music-query"} type="search" value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "Lyrics" ? "Type the lyrics you remember…" : "A song, an artist, that lyric stuck in your head…"} /><kbd>/</kbd><button type="submit" aria-label="Search">Search<Icon name="arrow" size={18} /></button></div></form>;
}

function ResultCard({ recording: original, bookmarked, comparing, onBookmark, onCompare, showDiscovery = true }: { showDiscovery?: boolean; recording: RecordingSummary; bookmarked: boolean; comparing: boolean; onBookmark: (item: RecordingSummary) => void; onCompare: (item: RecordingSummary) => void }) {
  const recording = useRecordingMedia(original);
  const player = useContext(PlayerContext);
  const artistUrl = artistPath(recording);
  return <article className="result-card"><button className="result-card__main" onClick={() => navigate(`/songs/${encodeURIComponent(recording.slug)}`)}><Artwork recording={recording} /><span className="result-card__copy"><strong>{recording.title}</strong><span>{recording.artist}</span><span className="recording-meta">{[recording.album, String(recording.releaseDate || "").slice(0, 4)].filter(Boolean).map(String).join(" · ")}</span></span></button><div className="result-actions">{showDiscovery && <button onClick={() => navigate(`/discover?seed=${encodeURIComponent(recording.slug)}`)}>Find similar</button>}{recording.previewUrl && <button aria-label={`Preview ${recording.title}`} onClick={() => player.play(recording)}><Icon name="play" size={16} /><span>Preview</span></button>}{artistUrl && <button onClick={() => navigate(artistUrl)}>Artist</button>}<button aria-pressed={comparing} onClick={() => onCompare(recording)}>{comparing ? "Comparing" : "Compare"}</button><button aria-pressed={bookmarked} onClick={() => onBookmark(recording)}>{bookmarked ? "Bookmarked" : "Bookmark"}</button></div>{recording.matchReason && <details className="result-reason"><summary>Why this result?</summary><p>{recording.matchReason}. Found through {(recording.providers || [recording.source || "Liner Notes"]).join(" and ")}.</p></details>}</article>;
}

function MusicBrief({ context, assistantEnabled }: { context: Record<string, unknown>; assistantEnabled: boolean }) {
  const [prompt, setPrompt] = useState("");
  const mutation = useMutation({ mutationFn: () => askAgent(prompt, context) });
  const results = Array.isArray(context.results) ? context.results as RecordingSummary[] : [];
  const sources = [...new Set(results.flatMap((item) => item.providers || [item.source || "Liner Notes"]))];
  if (!assistantEnabled) return null;
  return <section className="assistant-panel"><div className="assistant-panel__heading"><h2>Ask about this music</h2><p>{results.length ? `Ask about these recordings, their artists, or how the versions differ. Sources: ${sources.join(" · ")}.` : "Ask about the artists, credits, or story behind this recording."}</p></div>{assistantEnabled && <div className="assistant-panel__body"><form className="assistant-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><label htmlFor="agent-prompt">Your question</label><textarea id="agent-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={2000} required placeholder="Compare versions or explain the context" /><button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Researching…" : "Ask"}</button></form><div className="assistant-response" aria-live="polite">{mutation.error && <p>{mutation.error.message}</p>}{mutation.data && <ResearchAnswer response={mutation.data} />}</div></div>}</section>;
}

function Cards({ recordings, profile, toggleBookmark, toggleCompare }: { recordings: RecordingSummary[]; profile: Profile; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void }) {
  return <div className="results-list" data-results-list aria-live="polite">{recordings.map((recording) => <ResultCard key={recording.slug} recording={recording} bookmarked={profile.bookmarks.some((item) => item.slug === recording.slug)} comparing={profile.compare.some((item) => item.slug === recording.slug)} onBookmark={toggleBookmark} onCompare={toggleCompare} />)}</div>;
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
  const matching = results.filter((item) => (genreFilter === "all" || (item.genres as string[] | undefined)?.includes(genreFilter)) && (sourceFilter === "all" || (item.providers || [item.source]).includes(sourceFilter)));
  const sort = url.searchParams.get("sort") || "relevance";
  const filtered = [...matching].sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "newest" ? String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")) : 0);
  const setFilter = (name: string, value: string) => { const next = new URLSearchParams(url.searchParams); if (value === "all") next.delete(name); else next.set(name, value); next.delete("offset"); navigate(`/search?${next}`); };
  const intent = data?.intent as SearchIntent | undefined;
  return <section className="results-view"><div className="shell compact-search-wrap"><SearchBox initial={query} compact onSearch={recordSearch} /></div><div className="shell results-heading"><p className="eyebrow">Search results</p><h1>{query ? `“${query.replace(/^"|"$/g, "")}”` : "Start a search"}</h1><p aria-live="polite">{remote.isPending ? local.data ? `Showing local matches while global catalogs respond…` : "Searching across providers…" : remote.error ? "Remote providers are unavailable; showing local matches." : `${filtered.length} ranked matches`}</p>{intent && <span className="intent-chip">Matching {intent.type === "mixed" ? "song and artist" : intent.type === "track" ? "song title" : intent.type}</span>}</div>{results.length > 0 && <div className="shell filter-bar"><label>Genre<select value={genreFilter} onChange={(event) => setFilter("genre", event.target.value)}><option value="all">All genres</option>{genres.map((genre) => <option key={genre}>{genre}</option>)}</select></label><label>Source<select value={sourceFilter} onChange={(event) => setFilter("source", event.target.value)}><option value="all">All sources</option>{sources.map((source) => <option key={source}>{source}</option>)}</select></label><label>Sort by<select value={sort} onChange={(event) => setFilter("sort", event.target.value)}><option value="relevance">Best match</option><option value="title">Title A–Z</option><option value="newest">Newest first</option></select></label><span>{filtered.length} recordings</span></div>}<div className="shell">{local.error && remote.error && <State title="Search couldn’t load" body="Check your connection and try again." action={<button onClick={() => { local.refetch(); remote.refetch(); }}>Try again</button>} />}{(local.isPending && remote.isPending) && <State title="Looking through the catalog" body="Matching titles, artists, and remembered lyrics." />}{data && filtered.length === 0 && <State title="No match in this view" body="Clear the filters or try a shorter title, artist, or lyric fragment." />}<Cards recordings={filtered} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />{remote.data?.hasMore && <button className="load-more" onClick={() => { const next = new URLSearchParams(url.searchParams); next.set("offset", String(offset + 20)); navigate(`/search?${next}`); }}>Load the next page</button>}<MusicBrief context={{ type: "search", query, results: filtered.slice(0, 8) }} assistantEnabled={assistantEnabled} /></div></section>;
}

function State({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) { return <div className="state-message"><strong>{title}</strong><p>{body}</p>{action}</div>; }

function ShelfRecord({ recording: original, profile, toggleBookmark, toggleCompare }: { recording: RecordingSummary; profile: Profile; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void }) {
  const recording = useRecordingMedia(original);
  const player = useContext(PlayerContext);
  const saved = profile.bookmarks.some((item) => item.slug === recording.slug);
  const comparing = profile.compare.some((item) => item.slug === recording.slug);
  return <article className="shelf-record"><div className="sleeve"><button className="sleeve-open" aria-label={`Open ${recording.title} by ${recording.artist}`} onClick={() => navigate(`/songs/${recording.slug}`)}><Artwork recording={recording} /></button><button className="sleeve-save icon-button" aria-label={`${saved ? "Unbookmark" : "Bookmark"} ${recording.title}`} aria-pressed={saved} onClick={() => toggleBookmark(recording)}><Icon name="save" size={18} /></button></div><button className="record-title" onClick={() => navigate(`/songs/${recording.slug}`)}>{recording.title}</button><button className="record-artist" onClick={() => navigate(artistPath(recording) || `/search?q=${encodeURIComponent(recording.artist)}`)}>{recording.artist}</button><span className="recording-meta">{String(recording.releaseDate || "").slice(0, 4)} · {Array.isArray(recording.genres) ? String(recording.genres[0]) : "Recording"}</span><div className="shelf-actions">{recording.previewUrl ? <button onClick={() => player.play(recording)} aria-label={`Preview ${recording.title}`}><Icon name="play" size={15} />Preview</button> : <button onClick={() => navigate(`/songs/${recording.slug}`)}>Liner notes <Icon name="arrow" size={15} /></button>}<button aria-label={`${comparing ? "Remove from comparison" : "Compare"} ${recording.title}`} aria-pressed={comparing} onClick={() => toggleCompare(recording)}>{comparing ? "Added" : "Compare"}</button></div><button className="text-link" onClick={() => navigate(`/discover?seed=${encodeURIComponent(recording.slug)}`)}>Find similar →</button></article>;
}

function Home({ recordSearch, profile, toggleBookmark, toggleCompare, clearRecentSearches }: { clearRecentSearches: () => void; recordSearch: (query: string) => void; profile: Profile; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void }) {
  const discovery = useQuery({ queryKey: ["discover"], queryFn: () => api<{ featured: RecordingSummary[]; genres: Array<{ name: string; slug: string; color?: string }> }>("/api/discover") });
  const [era, setEra] = useState("All years");
  const featured = discovery.data?.featured || [];
  const filtered = featured.filter((item) => era === "All years" || (era === "Before 2000" ? String(item.releaseDate) < "2000" : String(item.releaseDate) >= "2000"));
  const runSearch = (query: string) => { recordSearch(query); navigate(`/search?q=${encodeURIComponent(query)}`); };
  return <div className="home-view"><section className="search-stage"><div className="shell"><div className="search-heading"><div><h1>What’s that song?</h1><p>Songs, artists, lyrics. Start anywhere.</p></div><button className="shuffle-button" disabled={!featured.length} onClick={() => navigate(`/songs/${featured[Math.floor(Math.random() * featured.length)].slug}`)}><Icon name="shuffle" size={18} />Surprise me</button></div><SearchBox onSearch={recordSearch} /><div className="search-examples"><span>Try a search</span>{["Talking Heads", "is this the real life", "Jolene live"].map((query) => <button key={query} onClick={() => runSearch(query)}>{query}<span aria-hidden="true">↗</span></button>)}</div>{profile.recentQueries.length > 0 && <div className="recent-searches"><span>Recently searched</span>{profile.recentQueries.slice(0, 3).map((query) => <button key={query} onClick={() => runSearch(query)}>{query}</button>)}<button onClick={clearRecentSearches} aria-label="Clear recent searches">Clear</button></div>}</div></section><div className="shell discovery-content"><section className="record-shelf"><div className="section-heading"><div><h2>Worth a listen</h2><p>Six recordings. A lot to get lost in.</p></div><div className="shelf-filters" aria-label="Filter recordings by era">{["All years", "Before 2000", "2000 onward"].map((value) => <button key={value} aria-pressed={era === value} onClick={() => setEra(value)}>{value}</button>)}</div></div>{discovery.isPending ? <State title="Opening the record shelf…" body="Loading recordings and their artwork." /> : discovery.error ? <State title="The shelf couldn’t load" body="Try again, or use the search above." action={<button onClick={() => discovery.refetch()}>Try again</button>} /> : <div className="shelf-grid">{filtered.map((recording) => <ShelfRecord key={recording.slug} recording={recording} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />)}</div>}</section><section className="genre-section"><div className="section-heading"><h2>Pick a sound</h2><button className="text-link" onClick={() => navigate("/explore")}>All genres <Icon name="arrow" size={17} /></button></div><div className="genre-buttons">{["pop", "alternative-rock", "hip-hop", "disco", "country", "funk"].map((slug) => { const genre = discovery.data?.genres.find((item) => item.slug === slug); return genre && <button key={slug} onClick={() => navigate(`/genres/${slug}`)}>{genre.name}<Icon name="arrow" size={18} /></button>; })}</div></section><section className="dig-section"><div className="section-heading"><h2>Keep digging</h2></div><div className="dig-grid"><button onClick={() => runSearch("Jolene")}><Icon name="record" size={24} /><strong>One song, many versions</strong><span>Find the original, the cover, the live take.</span><span className="dig-action">Explore Jolene <Icon name="arrow" size={17} /></span></button><button onClick={() => navigate("/insights")}><Icon name="shuffle" size={24} /><strong>Where does your taste go?</strong><span>Get recommendations from the music you save.</span><span className="dig-action">Your listening map <Icon name="arrow" size={17} /></span></button><button onClick={() => navigate("/bookmarks")}><Icon name="save" size={24} /><strong>Keep the good finds</strong><span>A collection of songs to come back to.</span><span className="dig-action">Your bookmarks <Icon name="arrow" size={17} /></span></button></div></section></div></div>;
}

function Explore({ profile, toggleBookmark, toggleCompare }: { profile: Profile; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void }) {
  const discovery = useQuery({ queryKey: ["discover"], queryFn: () => api<{ featured: RecordingSummary[]; genres: Array<{ name: string; slug: string; color?: string; count?: number }> }>("/api/discover") });
  return <section className="shell page-view"><p className="eyebrow">Explore the catalog</p><h1>Explore music</h1><p className="page-intro">Browse genres, find a familiar record, or try something you haven’t heard.</p><div className="genre-index">{discovery.data?.genres.map((genre) => <button key={genre.slug} onClick={() => navigate(`/genres/${genre.slug}`)}><strong>{genre.name}</strong><span>{genre.count ? `${genre.count} recordings` : "Open genre"} ↗</span></button>)}</div><section className="section-block"><p className="eyebrow">Records to start with</p><Cards recordings={discovery.data?.featured || []} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} /></section></section>;
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

function Song({ slug, assistantEnabled, toggleCompare, toggleBookmark, profile }: { slug: string; assistantEnabled: boolean; toggleCompare: (item: RecordingSummary) => void; toggleBookmark: (item: RecordingSummary) => void; profile: Profile }) {
  const endpoint = slug.startsWith("mbid-") ? `/api/external-songs/${encodeURIComponent(slug.slice(5))}` : slug.startsWith("apple-") ? `/api/apple-songs/${encodeURIComponent(slug.slice(6))}` : `/api/songs/${encodeURIComponent(slug)}`;
  const song = useQuery({ queryKey: ["song", slug], queryFn: () => api<SongDetail>(endpoint) });
  const media = useQuery({ queryKey: ["playback", slug], queryFn: () => api<Media>(`/api/playback/${encodeURIComponent(slug)}`), enabled: !slug.startsWith("mbid-") && !slug.startsWith("apple-"), staleTime: 600_000, retry: false });
  const player = useContext(PlayerContext);
  if (song.isPending) return <StatePage text="Opening the liner notes…" />;
  if (!song.data) return <StatePage text="Recording unavailable" />;
  const data = { ...song.data, artworkUrl: song.data.artworkUrl || media.data?.artworkUrl, previewUrl: song.data.previewUrl || media.data?.previewUrl, appleMusicUrl: song.data.appleMusicUrl || media.data?.appleMusicUrl }; const artist = typeof data.artist === "string" ? data.artist : data.artist.name;
  const summary = { slug, title: data.title, artist, artworkUrl: data.artworkUrl, previewUrl: data.previewUrl, genres: data.genres, releaseDate: data.releaseDate, version: data.version } as RecordingSummary;
  const bookmarked = profile.bookmarks.some((item) => item.slug === slug);
  const release = [data.album, data.releaseDate, data.duration].filter(Boolean).join(" · ");
  const lyricUrl = data.lyrics?.searchUrl || data.lyrics?.artistUrl;
  return <article className="song-view"><div className="shell">
    <button className="text-link" onClick={() => navigate("/explore")}>← Explore recordings</button>
    <div className="song-hero"><Artwork recording={summary} /><div><p className="eyebrow">{data.version || "Recording"}</p><h1>{data.title}</h1><p className="song-artist">{artist}</p>{release && <p className="song-release">{release}</p>}<div className="song-controls"><button className="primary-button" onClick={() => navigate(`/discover?seed=${encodeURIComponent(slug)}`)}>Find similar →</button>{summary.previewUrl && <button className="primary-button" onClick={() => player.play(summary)}><Icon name="play" size={18} />Play preview</button>}<button aria-pressed={bookmarked} onClick={() => toggleBookmark(summary)}><Icon name="save" size={18} />{bookmarked ? "Bookmarked" : "Bookmark"}</button><button onClick={() => { if (!profile.compare.some((item) => item.slug === slug)) toggleCompare(summary); navigate("/compare"); }}>Compare this version</button></div><div className="external-links">{data.appleMusicUrl && <a href={data.appleMusicUrl} target="_blank" rel="noreferrer">Apple Music ↗</a>}{(data.spotifyUrl || data.spotifySearchUrl) && <a href={data.spotifyUrl || data.spotifySearchUrl} target="_blank" rel="noreferrer">Find on Spotify ↗</a>}</div></div></div>
    <div className="song-details">{data.story && <section className="story-section"><h2>Behind the recording</h2><p>{data.story}</p></section>}<section className="song-info"><h2>Credits & details</h2><p className="genre-listing">{(data.genres || []).join(" · ") || "Genre unavailable"}</p>{Boolean(data.credits?.length) && <dl>{data.credits?.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>}</section><section className="lyrics-section"><h2>Lyrics</h2><p>{data.lyrics?.message || "Open a lyrics source to read the words."}</p>{lyricUrl && <a href={lyricUrl} target="_blank" rel="noreferrer">Read lyrics ↗</a>}</section><section className="sources-section"><h2>Sources</h2><p>{(data.sources || []).join(" · ") || "Source details unavailable"}</p><div className="external-links">{data.musicBrainzUrl && <a href={data.musicBrainzUrl}>MusicBrainz ↗</a>}</div></section></div>
    {Boolean(data.related?.length) && <section className="section-block"><h2>Other versions</h2><div className="related-versions">{data.related?.map((item) => <button key={item.slug} onClick={() => navigate(`/songs/${item.slug}`)}><strong>{item.title}</strong><span>{item.version} · {item.releaseDate}</span><Icon name="arrow" size={18} /></button>)}</div></section>}<MusicBrief context={{ type: "song", song: data }} assistantEnabled={assistantEnabled} /></div></article>;
}

function Compare({ items, toggleCompare, assistantEnabled }: { items: RecordingSummary[]; assistantEnabled: boolean; toggleCompare: (item: RecordingSummary) => void }) {
  return <section className="shell page-view"><h1>Compare recordings</h1><p className="page-intro">Choose up to three recordings. Compare their details and get a short explanation of the differences.</p>{items.length < 2 && <State title="Choose at least two recordings" body="Use Compare on any search result. Your comparison tray holds up to three recordings." action={<button className="text-link" onClick={() => navigate("/")}>Find recordings →</button>} />}{items.length >= 2 && <Comparison items={items} enabled={assistantEnabled} />}<div className="compare-grid">{items.map((item) => <article key={item.slug}><button className="remove-compare" onClick={() => toggleCompare(item)}>Remove</button><div className={`compare-art${item.artworkUrl || item.thumbnailUrl ? " has-artwork" : ""}`} style={item.artworkUrl || item.thumbnailUrl ? { backgroundImage: `url(${item.artworkUrl || item.thumbnailUrl})` } : undefined} /><span className="source-badge">{item.source || "Liner Notes"}</span><h2>{item.title}</h2><p>{item.artist}</p><dl><dt>Version</dt><dd>{String(item.version || "Recording")}</dd><dt>Released</dt><dd>{String(item.releaseDate || "Unknown")}</dd><dt>Genres</dt><dd>{Array.isArray(item.genres) ? (item.genres as string[]).join(", ") : "Unknown"}</dd></dl><button className="text-link" onClick={() => navigate(`/songs/${item.slug}`)}>Open liner notes →</button></article>)}</div></section>;
}

function Insights({ profile }: { profile: Profile }) {
  const insights = useQuery({ queryKey: ["insights", profile.bookmarks, profile.recentQueries], queryFn: () => getRecommendations(profile.bookmarks, profile.recentQueries) });
  const data = insights.data;
  return <section className="shell page-view insights-view"><p className="eyebrow">Private music intelligence</p><h1>Your listening map</h1><p className="page-intro">See the artists, genres, and eras in your bookmarks, and find something new to try.</p>{insights.isPending && <State title="Finding the patterns…" body="Looking through your bookmarked music." />}{insights.error && <State title="Your listening map couldn’t load" body="Try again in a moment." action={<button onClick={() => insights.refetch()}>Try again</button>} />}{data && <><div className="insight-hero"><TasteConstellation genres={data.profile.topGenres} decades={data.profile.decades} /><div className="metric-ledger"><div><strong>{data.profile.diversityScore}</strong><span>Diversity score</span></div><div><strong>{data.profile.uniqueArtists}</strong><span>Artists</span></div><div><strong>{data.profile.uniqueGenres}</strong><span>Genres</span></div><div><strong>{data.profile.searchCount}</strong><span>Recent searches</span></div></div></div><div className="insight-columns"><section><p className="eyebrow">Top genres</p>{data.profile.topGenres.length ? data.profile.topGenres.map((item) => <div className="bar-row" key={item.name}><span>{item.name}</span><i style={{ width: `${Math.min(100, item.count / Math.max(1, data.profile.bookmarkCount) * 100)}%` }} /></div>) : <p>Bookmark a few recordings to shape this profile.</p>}</section><section><p className="eyebrow">Top artists</p>{data.profile.topArtists.length ? <ol>{data.profile.topArtists.map((item) => <li key={item.name}>{item.name}<span>{item.count}</span></li>)}</ol> : <p>No artist pattern yet.</p>}</section></div><section className="section-block"><h2>Based on your bookmarks</h2><p>Matches use researched genre tags, not audio analysis.</p>{data.totalSeeds > data.seedsChecked && <p>Based on {data.seedsChecked} of your {data.totalSeeds} bookmarked recordings, covering different artists first.</p>}{data.status === "partial" && <p role="status">Some catalog lookups couldn’t finish. Any results below are the matches we could verify. <button onClick={() => insights.refetch()}>Retry catalog search</button></p>}{data.status === "empty" && <p>{data.profile.bookmarkCount ? "No close genre matches found. Try discovery from another bookmarked recording; we won’t fill this list with unrelated songs." : "Bookmark some recordings to find music with related genres."}</p>}<div className="recommendation-grid">{data.recommendations.map((item) => <article key={item.slug}><span className="source-badge">{item.source || "Liner Notes"}</span><h2>{item.title}</h2><p>{item.artist}</p><small>{item.reason}</small><button onClick={() => navigate(`/songs/${item.slug}`)}>Open ↗</button></article>)}</div></section></>}</section>;
}

function TasteConstellation({ genres, decades }: { genres: Array<{ name: string; count: number }>; decades: Array<{ name: string; count: number }> }) { const labels = [...genres.slice(0, 4), ...decades.slice(0, 2)]; return <div className="taste-constellation" aria-label={`Taste map: ${labels.map((item) => item.name).join(", ") || "not enough data"}`}><span className="constellation-core">Your sounds & eras</span>{labels.map((item, index) => <span key={item.name} style={{ "--angle": `${index * (360 / Math.max(1, labels.length))}deg`, "--distance": `${80 + item.count * 8}px` } as React.CSSProperties}>{item.name}</span>)}</div>; }

function Bookmarks({ profile, toggleBookmark, toggleCompare }: { profile: Profile; toggleBookmark: (item: RecordingSummary) => void; toggleCompare: (item: RecordingSummary) => void }) { return <section className="shell page-view"><p className="eyebrow">Metadata bookmarks</p><h1>Your bookmarks</h1><p className="page-intro">The records you want to come back to. Saved in this browser.</p>{profile.bookmarks.length ? <Cards recordings={profile.bookmarks} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} /> : <State title="Nothing bookmarked yet" body="Bookmark a search result to build your private listening map." action={<button className="text-link" onClick={() => navigate("/")}>Search the catalog →</button>} />}</section>; }

function About() { return <section className="shell page-view about-view"><p className="eyebrow">How Liner Notes works</p><h1>About Liner Notes</h1><p className="page-intro">Find a song, explore the people behind it, and hear where it takes you.</p><div className="principle-grid"><section><h2>More places to look</h2><p>Search our selected recordings alongside MusicBrainz and Apple Music by song, artist, or remembered lyrics.</p></section><section><h2>Recommendations with a reason</h2><p>Save a few recordings and your listening map will suggest more music, with a reason for every recommendation.</p></section><section><h2>A way into the music</h2><p>Listen to available previews, then follow the links to music services and lyrics sources for the full experience.</p></section><section><h2>The people behind the record</h2><p>Open a recording for credits, release details, other versions, and the sources behind those details.</p></section></div></section>; }

function StatePage({ text }: { text: string }) { return <div className="shell state-page">{text}</div>; }

function App() {
  const path = usePath(); const url = useMemo(() => new URL(path, location.origin), [path]);
  const { profile, toggleBookmark, toggleCompare, recordSearch, clearRecentSearches } = useProfile();
  const [current, setCurrent] = useState<RecordingSummary | null>(null);
  const capabilities = useQuery({ queryKey: ["capabilities"], queryFn: () => api<{ musicAssistant: boolean }>("/api/capabilities") });
  const assistantEnabled = capabilities.data?.musicAssistant === true;
  const parts = url.pathname.split("/").filter(Boolean);
  let content: React.ReactNode = <Home clearRecentSearches={clearRecentSearches} recordSearch={recordSearch} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />;
  if (url.pathname === "/search") content = <SearchResults url={url} profile={profile} recordSearch={recordSearch} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} assistantEnabled={assistantEnabled} />;
  else if (url.pathname === "/discover") content = <Discovery key={path} url={url} bookmarks={profile.bookmarks} navigate={navigate} renderRecording={(recording) => <ResultCard showDiscovery={false} recording={{ ...recording, matchReason: undefined }} bookmarked={profile.bookmarks.some((item) => item.slug === recording.slug)} comparing={profile.compare.some((item) => item.slug === recording.slug)} onBookmark={toggleBookmark} onCompare={toggleCompare} />} />;
  else if (url.pathname === "/trails") content = <TrailLibrary navigate={navigate} />;
  else if (url.pathname === "/explore") content = <Explore profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />;
  else if (parts[0] === "genres" && parts[1]) content = <GenrePage slug={parts[1]} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />;
  else if (parts[0] === "artists" && parts[1] && parts[2]) content = <ArtistPage source={parts[1]} id={parts[2]} profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />;
  else if (parts[0] === "songs" && parts[1]) content = <Song key={parts[1]} slug={decodeURIComponent(parts.slice(1).join("/"))} assistantEnabled={assistantEnabled} toggleCompare={toggleCompare} toggleBookmark={toggleBookmark} profile={profile} />;
  else if (url.pathname === "/compare") content = <Compare items={profile.compare} toggleCompare={toggleCompare} assistantEnabled={assistantEnabled} />;
  else if (url.pathname === "/insights") content = <Insights profile={profile} />;
  else if (url.pathname === "/bookmarks" || url.pathname === "/saved") content = <Bookmarks profile={profile} toggleBookmark={toggleBookmark} toggleCompare={toggleCompare} />;
  else if (url.pathname === "/about") content = <About />;
  const nav = [{ path: "/", label: "Search" }, { path: "/explore", label: "Explore" }, { path: "/insights", label: "Insights" }, { path: "/trails", label: "Trails" }, { path: "/bookmarks", label: "Bookmarks" }, { path: "/compare", label: "Compare" }];
  return <PlayerContext.Provider value={{ current, play: setCurrent }}><a className="skip-link" href="#app">Skip to content</a><header className="site-header"><div className="shell site-header__inner"><button className="wordmark" onClick={() => navigate("/")} aria-label="Liner Notes home"><Icon name="record" size={30} /><span>liner notes<span className="wordmark-dot">.</span></span></button><nav aria-label="Primary navigation">{nav.map((item) => <button key={item.path} aria-current={url.pathname === item.path ? "page" : undefined} onClick={() => navigate(item.path)}>{item.label}</button>)}</nav></div></header><main id="app" tabIndex={-1}>{content}</main>{profile.compare.length > 0 && url.pathname !== "/compare" && <div className="compare-tray shell"><span>{profile.compare.length} of 3 recordings selected</span><button onClick={() => navigate("/compare")}>Compare recordings <Icon name="arrow" size={18} /></button></div>}<footer><div className="shell"><p>Liner Notes · Stay curious. Keep listening.</p><button onClick={() => navigate("/about")}>About Liner Notes</button></div></footer><PreviewPlayer current={current} close={() => setCurrent(null)} /></PlayerContext.Provider>;
}

type WindowWithRoot = Window & { linerNotesRoot?: ReturnType<typeof createRoot> };
const appWindow = window as WindowWithRoot;
const root = appWindow.linerNotesRoot || createRoot(document.getElementById("root")!);
appWindow.linerNotesRoot = root;
root.render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
